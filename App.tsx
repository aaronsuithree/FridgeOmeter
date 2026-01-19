
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Chat, GenerateContentResponse } from '@google/genai';
import { 
  FoodItem, UserStats, UserProfile, 
  ChatMessage, ViewType, MealSuggestion, PlaceResult, Category, StorageLocation, ScanResult, Recipe
} from './types';
import * as StorageService from './services/storageService';
import * as GeminiService from './services/geminiService';
import ExpiryBadge from './components/ExpiryBadge';
import ImageUpload from './components/ImageUpload';
import { 
  IconHome, IconList, IconPlus, IconTrash, IconEdit, IconChef,
  IconCheck, IconMic, IconSparkles, 
  IconChat, IconSend, IconX, IconSearch, IconCamera, IconFire, IconSun, IconMoon, IconLeaf, IconInfo
} from './components/Icons';

// --- Base64 Audio Utilities ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>('welcome');
  const [user, setUser] = useState<UserProfile | null>(StorageService.getUserProfile());
  const [inventory, setInventory] = useState<FoodItem[]>(StorageService.getInventory());
  const [stats, setStats] = useState<UserStats>(StorageService.getStats());
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isNeuralSyncEnabled, setIsNeuralSyncEnabled] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (user && !user.hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      document.documentElement.classList.toggle('dark', user.theme === 'dark');
      document.documentElement.classList.toggle('high-contrast', user.highContrast);
      document.body.classList.toggle('gamified-body', user.isGamified);
      let baseSize = 16;
      if (user.appScale === 'small') baseSize = 14;
      if (user.appScale === 'large') baseSize = 18;
      document.documentElement.style.fontSize = `${baseSize}px`;
    }
  }, [user?.theme, user?.highContrast, user?.appScale, user?.isGamified]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleApiKeyPrompt = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
      return true;
    }
    return false;
  };

  const handleAddFood = (item: FoodItem) => {
    const updated = StorageService.addFoodItem(item);
    setInventory(updated);
    setView('inventory');
    const msg = user?.isGamified 
      ? `Captured ${item.name}! Added to loot.` 
      : `Logged ${item.name} to ${item.storageLocation} Vault.`;
    setNotification({ message: msg, type: 'success' });
  };

  const handleUpdateFood = (item: FoodItem) => {
    const updated = StorageService.updateFoodItem(item);
    setInventory(updated);
    setNotification({ message: `System updated: ${item.name}`, type: 'success' });
  };

  const handleAction = (item: FoodItem, action: 'consumed' | 'tossed' | 'composted') => {
    StorageService.updateStatsForAction(item, action);
    StorageService.removeFoodItem(item.id);
    setInventory(StorageService.getInventory());
    setStats(StorageService.getStats());
    
    let msg = "";
    if (user?.isGamified) {
      if (action === 'consumed') msg = `Level Up! You saved ${item.name}! 🌟`;
      else if (action === 'composted') msg = `Eco-Power! ${item.name} returned to nature. 🍃`;
      else msg = `${item.name} lost to the void. 💀`;
    } else {
      if (action === 'consumed') msg = `Rescued ${item.name}! Value added to stats.`;
      else if (action === 'composted') msg = `Asset ${item.name} recycled as biological compost.`;
      else msg = `${item.name} discarded. System updated.`;
    }

    setNotification({ 
      message: msg, 
      type: (action === 'consumed' || action === 'composted') ? 'success' : 'info' 
    });
  };

  const handleSkipOnboarding = (neverShowAgain: boolean) => {
    setShowOnboarding(false);
    if (neverShowAgain && user) {
      const updated = StorageService.updateProfile({ hasSeenOnboarding: true });
      if (updated) setUser(updated);
    }
  };

  if (!user || view === 'welcome') {
    return <WelcomeView 
      hasApiKey={hasApiKey}
      onKeySelected={() => setHasApiKey(true)}
      onComplete={(data) => { setUser(StorageService.saveUserProfile(data)); setView('home'); }} 
    />;
  }

  const NavItem = ({ v, icon: Icon, label, gamifiedLabel }: { v: ViewType, icon: any, label: string, gamifiedLabel: string }) => (
    <button 
      onClick={() => setView(v)} 
      className={`flex flex-col items-center gap-1 p-3 transition-all rounded-2xl ${view === v ? (user.isGamified ? 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30') : 'text-slate-400 hover:text-emerald-500'}`}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-bold">{user.isGamified ? gamifiedLabel : label}</span>
    </button>
  );

  return (
    <div className={`min-h-screen pb-24 transition-colors duration-300 ${user.theme === 'dark' ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {showOnboarding && <LoginWelcomeModal onDismiss={handleSkipOnboarding} isGamified={user.isGamified} />}
      
      <header className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-[100]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} rounded-lg flex items-center justify-center text-white text-xl bouncy`}>🧊</div>
            <h1 className="text-xl font-bold tracking-tight">{user.isGamified ? 'Fridge Hero' : 'Fridgeometer'}</h1>
          </div>
          <div className="flex items-center gap-4">
             <button 
               onClick={() => setIsNeuralSyncEnabled(!isNeuralSyncEnabled)}
               className={`p-2 rounded-full transition-all flex items-center gap-2 border bouncy ${isNeuralSyncEnabled ? (user.isGamified ? 'bg-violet-100 border-violet-200 text-violet-700 dark:bg-violet-900/30 dark:border-violet-800' : 'bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800') : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}
             >
               <IconMic className={`w-4 h-4 ${isNeuralSyncEnabled ? 'animate-pulse' : ''}`} />
               <span className="text-[10px] font-black uppercase hidden sm:inline">{isNeuralSyncEnabled ? (user.isGamified ? 'Magic Voice Active' : 'Neural Sync Active') : 'Mic Muted'}</span>
             </button>
             <button 
               onClick={() => {
                 const newTheme = user.theme === 'light' ? 'dark' : 'light';
                 const updated = StorageService.updateProfile({ theme: newTheme });
                 if(updated) setUser(updated);
               }}
               className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
             >
               {user.theme === 'light' ? <IconMoon className="w-5 h-5" /> : <IconSun className="w-5 h-5 text-yellow-400" />}
             </button>
             <button onClick={() => setView('profile')} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{user.name}</p>
                <p className={`text-[10px] ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} font-bold`}>{user.isGamified ? `Hero Level ${stats.level}` : `Rank ${stats.level}`}</p>
              </div>
              <div className={`w-10 h-10 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white rounded-full flex items-center justify-center font-bold`}>{user.name[0]}</div>
            </button>
          </div>
        </div>
      </header>

      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-top-4">
          <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${notification.type === 'success' ? (user.isGamified ? 'bg-violet-600' : 'bg-emerald-600') : notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
            {notification.type === 'success' && <IconSparkles className="w-4 h-4" />}
            {notification.message}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto p-6 animate-in fade-in duration-500">
        {(() => {
          switch(view) {
            case 'home': return <DashboardView stats={stats} user={user} inventory={inventory} />;
            case 'inventory': return <InventoryView items={inventory} onRefresh={() => setInventory(StorageService.getInventory())} user={user} onAdd={handleAddFood} onUpdate={handleUpdateFood} onError={(m) => setNotification({ message: m, type: 'error' })} onKeyPrompt={handleApiKeyPrompt} onAction={handleAction} />;
            case 'scanner': return <ScannerView user={user} onAdd={handleAddFood} onError={(msg) => setNotification({ message: msg, type: 'error' })} isNeuralSyncEnabled={isNeuralSyncEnabled} onKeyPrompt={handleApiKeyPrompt} />;
            case 'recipes': return <RecipesView inventory={inventory} user={user} />;
            case 'chat': return <ChatHub user={user} />;
            case 'profile': return <ProfileHub user={user} onUpdate={(u) => setUser(u)} onLogout={() => { StorageService.clearUserProfile(); setUser(null); setView('welcome'); }} />;
            case 'add': return <AddAssetView user={user} onCancel={() => setView('inventory')} onAdd={handleAddFood} onKeyPrompt={handleApiKeyPrompt} />;
            default: return <DashboardView stats={stats} user={user} inventory={inventory} />;
          }
        })()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-700 px-4 py-2 flex justify-around items-center z-[200]">
        <NavItem v="home" icon={IconHome} label="Home" gamifiedLabel="Hero Hub" />
        <NavItem v="inventory" icon={IconList} label="Fridge" gamifiedLabel="Inventory" />
        <button onClick={() => setView('scanner')} className={`w-14 h-14 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all -mt-8 border-4 border-white dark:border-slate-800 bouncy`}>
          <IconCamera className="w-7 h-7" />
        </button>
        <NavItem v="recipes" icon={IconChef} label="Recipes" gamifiedLabel="Quests" />
        <NavItem v="chat" icon={IconChat} label="Assist" gamifiedLabel="Neural" />
      </nav>
    </div>
  );
};

// --- Welcome Introduction Modal ---
const LoginWelcomeModal: React.FC<{ onDismiss: (neverShowAgain: boolean) => void, isGamified: boolean }> = ({ onDismiss, isGamified }) => {
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className={`max-w-lg w-full bg-white dark:bg-slate-900 ${isGamified ? 'rounded-mega-blob' : 'rounded-[3.5rem]'} p-12 space-y-10 shadow-3xl border border-white/20 relative overflow-hidden`}>
        <div className={`absolute -top-24 -right-24 w-64 h-64 ${isGamified ? 'bg-violet-500/20' : 'bg-emerald-500/10'} rounded-full blur-3xl animate-pulse`}></div>
        
        <div className="text-center space-y-4 relative">
          <div className={`w-24 h-24 ${isGamified ? 'bg-violet-600' : 'bg-emerald-600'} rounded-[2rem] mx-auto flex items-center justify-center text-5xl shadow-2xl rotate-12 transition-transform hover:rotate-0 duration-700`}>🧊</div>
          <h2 className={`text-4xl font-black italic uppercase tracking-tighter ${isGamified ? 'text-violet-600' : ''}`}>Welcome!</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">{isGamified ? "Your Hero's Journey Starts Here" : "Your Sustainable Kitchen Assistant"}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 text-left">
          <div className={`flex gap-6 items-start p-6 bg-slate-50 dark:bg-slate-800/50 ${isGamified ? 'rounded-blob' : 'rounded-3xl'} border border-slate-100 dark:border-slate-700 group hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all`}>
             <span className="text-3xl filter drop-shadow-md group-hover:scale-125 transition-transform">📸</span>
             <div className="space-y-1">
               <p className="font-black italic uppercase tracking-tight text-sm">{isGamified ? 'Magic Scanner' : 'Smart Scanner'}</p>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Use your camera to identify food and earn XP automatically.</p>
             </div>
          </div>

          <div className={`flex gap-6 items-start p-6 bg-slate-50 dark:bg-slate-800/50 ${isGamified ? 'rounded-blob' : 'rounded-3xl'} border border-slate-100 dark:border-slate-700 group hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all`}>
             <span className="text-3xl filter drop-shadow-md group-hover:scale-125 transition-transform">💎</span>
             <div className="space-y-1">
               <p className="font-black italic uppercase tracking-tight text-sm">{isGamified ? 'Level Up' : 'Waste Reduction'}</p>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Rescue food from the void to climb the leaderboards!</p>
             </div>
          </div>

          <div className={`flex gap-6 items-start p-6 bg-slate-50 dark:bg-slate-800/50 ${isGamified ? 'rounded-blob' : 'rounded-3xl'} border border-slate-100 dark:border-slate-700 group hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all`}>
             <span className="text-3xl filter drop-shadow-md group-hover:scale-125 transition-transform">🍲</span>
             <div className="space-y-1">
               <p className="font-black italic uppercase tracking-tight text-sm">{isGamified ? 'Cooking Quests' : 'Recipe Ideas'}</p>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Generate amazing meals based on your current loot chest.</p>
             </div>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <button 
            onClick={() => onDismiss(false)} 
            className={`w-full py-6 ${isGamified ? 'bg-violet-600' : 'bg-emerald-600'} hover:opacity-90 text-white font-black rounded-[2rem] uppercase tracking-widest italic shadow-2xl active:scale-95 transition-all text-sm`}
          >
            Continue
          </button>
          <button 
            onClick={() => onDismiss(true)} 
            className="w-full text-[10px] font-black text-slate-400 hover:text-red-500 transition-colors uppercase tracking-[0.3em] italic"
          >
            Don't show again
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Dashboard View ---
const DashboardView: React.FC<{ stats: UserStats, user: UserProfile, inventory: FoodItem[] }> = ({ stats, user, inventory }) => {
  const healthyCount = inventory.filter(i => i.category === 'Produce' || i.category === 'Grains').length;
  const healthScore = Math.round((healthyCount / (inventory.length || 1)) * 100);
  const xpNeeded = 300;
  const currentXp = stats.xp % xpNeeded;
  const progress = (currentXp / xpNeeded) * 100;

  // Waste Analysis Data
  const totalProcessed = stats.rescued + stats.wasted + stats.composted;
  const rescuedPercent = totalProcessed ? Math.round((stats.rescued / totalProcessed) * 100) : 0;
  const compostPercent = totalProcessed ? Math.round((stats.composted / totalProcessed) * 100) : 0;
  const wastePercent = totalProcessed ? Math.round((stats.wasted / totalProcessed) * 100) : 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <p className={`text-xs font-bold ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} uppercase tracking-widest`}>
            {user.isGamified ? 'Your Progress' : 'System Telemetry'}
          </p>
          <h2 className="text-4xl font-black tracking-tighter italic uppercase">
            {user.isGamified ? 'HERO HUB' : 'MISSION CONTROL'}
          </h2>
        </div>
        <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-6 py-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 bouncy">
           <div className={`w-10 h-10 ${user.isGamified ? 'bg-amber-100 text-amber-600' : 'bg-orange-100 text-orange-600'} dark:bg-opacity-20 rounded-full flex items-center justify-center`}>
             <IconFire className="w-6 h-6" />
           </div>
           <div className="text-left">
             <p className="text-[10px] font-bold text-slate-400 uppercase">Streak</p>
             <p className="text-lg font-black">{stats.streakDays} Days</p>
           </div>
        </div>
      </div>

      {user.isGamified && (
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-8 rounded-blob text-white shadow-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
             <IconSparkles className="w-32 h-32" />
           </div>
           <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest opacity-80">Current Power Level</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black italic">LVL {stats.level}</span>
                  <span className="text-xl font-bold opacity-60">Hero</span>
                </div>
              </div>
              <div className="flex-1 max-w-md space-y-3">
                <div className="flex justify-between text-xs font-black uppercase italic tracking-widest">
                  <span>XP: {currentXp} / {xpNeeded}</span>
                  <span>{Math.round(progress)}% to Level Up</span>
                </div>
                <div className="h-4 w-full bg-black/20 rounded-full overflow-hidden border border-white/10">
                  <div className="h-full bg-amber-400 xp-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* NEW: Waste & Composting Analysis Section */}
      <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[3rem]'} shadow-sm border border-slate-100 dark:border-slate-700 space-y-8 animate-in slide-in-from-top-4 duration-700`}>
        <div className="flex justify-between items-center">
           <div className="space-y-1 text-left">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter">{user.isGamified ? 'SUSTAINABILITY QUEST' : 'WASTE ANALYSIS HUB'}</h3>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{user.isGamified ? 'Your Path to Eco-Mastery' : 'Molecular Lifecycle Telemetry'}</p>
           </div>
           <div className="flex gap-2">
              <div className="flex flex-col items-center p-3 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/40 min-w-[80px]">
                <span className="text-xs font-black text-red-600">{stats.moldDetected}</span>
                <span className="text-[8px] font-bold text-red-400 uppercase tracking-tighter">Bio-Alerts</span>
              </div>
              <div className="flex flex-col items-center p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 min-w-[80px]">
                <span className="text-xs font-black text-emerald-600">{stats.composted}</span>
                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-tighter">Composted</span>
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="space-y-2">
               <div className="flex justify-between text-[10px] font-black uppercase italic tracking-widest">
                 <span className="text-emerald-500">Rescued ({rescuedPercent}%)</span>
                 <span className="text-slate-400">{stats.rescued} Units</span>
               </div>
               <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500" style={{ width: `${rescuedPercent}%` }}></div>
               </div>
            </div>
            <div className="space-y-2">
               <div className="flex justify-between text-[10px] font-black uppercase italic tracking-widest">
                 <span className="text-indigo-500">Composted ({compostPercent}%)</span>
                 <span className="text-slate-400">{stats.composted} Units</span>
               </div>
               <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full overflow-hidden">
                 <div className="h-full bg-indigo-500" style={{ width: `${compostPercent}%` }}></div>
               </div>
            </div>
            <div className="space-y-2">
               <div className="flex justify-between text-[10px] font-black uppercase italic tracking-widest">
                 <span className="text-rose-500">Wasted ({wastePercent}%)</span>
                 <span className="text-slate-400">{stats.wasted} Units</span>
               </div>
               <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full overflow-hidden">
                 <div className="h-full bg-rose-500" style={{ width: `${wastePercent}%` }}></div>
               </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-10 bg-slate-50 dark:bg-slate-900/50 rounded-mega-blob border border-slate-100 dark:border-slate-800">
             <div className="text-center">
                <p className="text-4xl font-black italic tracking-tighter text-indigo-600">{(stats.co2Saved).toFixed(1)}kg</p>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-2">Carbon Offset Impact</p>
             </div>
             <div className="mt-6 flex gap-4">
                <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-sm">
                   <IconLeaf className="w-4 h-4 text-emerald-500" />
                   <span className="text-[10px] font-bold">Rescuing Master</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-sm">
                   <IconSparkles className="w-4 h-4 text-amber-500" />
                   <span className="text-[10px] font-bold">{stats.moldDetected} Bio-Hazard Catches</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[2rem]'} shadow-sm border border-slate-100 dark:border-slate-700 space-y-4 text-center hover:scale-[1.02] transition-transform`}>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{user.isGamified ? 'Loot Freshness' : 'Health-Score'}</p>
          <div className="flex flex-col items-center">
             <p className={`text-5xl font-black ${user.isGamified && healthScore > 80 ? 'text-emerald-500' : ''}`}>{healthScore}%</p>
             <p className="text-[8px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Vault Purity Factor</p>
          </div>
          <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full overflow-hidden">
            <div className={`h-full ${user.isGamified ? 'bg-violet-500' : 'bg-emerald-500'}`} style={{ width: `${healthScore}%` }}></div>
          </div>
        </div>

        <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[2rem]'} shadow-sm border border-slate-100 dark:border-slate-700 space-y-4 text-center hover:scale-[1.02] transition-transform`}>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{user.isGamified ? 'Gold Rescued' : 'Value of Food Rescued'}</p>
          <p className="text-5xl font-black text-amber-500">${stats.moneySaved.toFixed(2)}</p>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Converted Item Value</p>
        </div>

        <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[2rem]'} shadow-sm border border-slate-100 dark:border-slate-700 space-y-4 text-center hover:scale-[1.02] transition-transform`}>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{user.isGamified ? 'Earth Hero Impact' : 'CO2 Impact'}</p>
          <p className="text-5xl font-black text-indigo-500">{stats.co2Saved.toFixed(1)}kg</p>
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">CO2 Offset Achievement</p>
        </div>
      </div>
    </div>
  );
};

// --- Inventory View ---
const InventoryView: React.FC<{ 
  items: FoodItem[], 
  onRefresh: () => void, 
  user: UserProfile, 
  onAdd: (i: FoodItem) => void, 
  onUpdate: (i: FoodItem) => void,
  onError: (m: string) => void, 
  onKeyPrompt: () => Promise<boolean>,
  onAction: (item: FoodItem, action: 'consumed' | 'tossed' | 'composted') => void
}> = ({ items, onRefresh, user, onAdd, onUpdate, onError, onKeyPrompt, onAction }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<StorageLocation>('Fridge');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);

  const filtered = items.filter(i => i.storageLocation === activeTab);

  const handleFileUpload = async (base64: string) => {
    // Deep scans using Gemini 3 Pro require a paid key
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
    if (!hasKey) {
      const selected = await onKeyPrompt();
      if (!selected) return;
    }

    setLoadingScan(true);
    try {
      const res = await GeminiService.analyzeFoodImage(base64);
      setScanResult(res);
      // Trigger vocal report immediately
      await GeminiService.speakStatusReport(res, user.isGamified);
    } catch (e: any) {
      if (e.message?.includes('PERMISSION_DENIED')) onKeyPrompt().then(s => s && handleFileUpload(base64));
      else onError("Analysis failed.");
    } finally {
      setLoadingScan(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter">
          {user.isGamified ? 'LOOT CHEST' : 'UNIT VAULT'}
        </h2>
        <div className="flex gap-4">
          <button onClick={() => setShowAddMenu(true)} className={`px-6 py-4 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-[10px] italic flex items-center gap-2 hover:opacity-90 bouncy`}>
            <IconPlus className="w-4 h-4" /> {user.isGamified ? 'Collect Loot' : 'Add Asset'}
          </button>
          <button onClick={() => setIsOpen(!isOpen)} className={`px-8 py-4 ${isOpen ? 'bg-slate-200 text-slate-600' : 'bg-slate-900 text-white'} font-black rounded-2xl shadow-xl transition-all uppercase tracking-widest text-[10px] italic bouncy`}>
            {isOpen ? (user.isGamified ? 'Close Chest' : 'Secure Vault') : (user.isGamified ? 'Open Chest' : 'Open Vault')}
          </button>
        </div>
      </div>

      <div className={`fridge-container relative min-h-[600px] w-full max-w-2xl mx-auto ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3.5rem]'} overflow-hidden bg-slate-200 dark:bg-slate-950 shadow-inner border-[16px] ${user.isGamified ? 'border-amber-700/20' : 'border-slate-300 dark:border-slate-800'} ring-1 ring-slate-100 dark:ring-slate-700`}>
        <div className="fridge-interior p-10 space-y-10 flex flex-col h-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
          <div className="flex justify-around border-b border-slate-200 dark:border-slate-800 pb-6">
             {(['Fridge', 'Freezer', 'Pantry'] as StorageLocation[]).map(loc => (
               <button key={loc} onClick={() => setActiveTab(loc)} className={`text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all bouncy ${activeTab === loc ? 'bg-white dark:bg-slate-800 shadow-lg text-violet-600' : 'text-slate-400 hover:text-violet-600'}`}>{loc}</button>
             ))}
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-6 pb-20">
            {filtered.length === 0 ? (
              <div className="col-span-full h-full flex items-center justify-center opacity-10 grayscale flex-col gap-6 py-20">
                <IconList className="w-24 h-24" />
                <p className="text-sm font-black uppercase tracking-[1em] italic">Empty Slot</p>
              </div>
            ) : filtered.map(item => (
              <div key={item.id} className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob border-violet-100' : 'rounded-[2.5rem] border-slate-100'} shadow-sm border dark:border-slate-700 space-y-5 group animate-in slide-in-from-bottom-2 bouncy relative`}>
                 {item.mouldDetected && (
                    <div className="absolute top-4 right-4 animate-pulse">
                      <div className="bg-red-600 text-white p-1 rounded-full shadow-lg" title="Mould Detected">
                        <IconFire className="w-4 h-4" />
                      </div>
                    </div>
                 )}
                 <div className="flex justify-between items-start">
                   <div className="text-left">
                     <h4 className="text-xl font-black uppercase italic tracking-tighter leading-tight group-hover:text-violet-600 transition-colors">{item.name}</h4>
                     <p className={`text-[10px] font-bold ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} uppercase mt-1 tracking-widest`}>{item.category} • x{item.quantity}</p>
                   </div>
                   <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={() => setEditingItem(item)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"><IconEdit className="w-4 h-4" /></button>
                   </div>
                 </div>
                 <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-50 dark:border-slate-700">
                   <ExpiryBadge date={item.expiryDate} />
                   <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">${(item.estimatedPrice || 0).toFixed(2)}/u</span>
                   {item.calories !== undefined && (
                     <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100 bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">{item.calories} kcal</span>
                   )}
                 </div>
                 <div className="grid grid-cols-2 gap-2 pt-2">
                    <button 
                      onClick={() => onAction(item, 'consumed')}
                      className={`py-2 ${user.isGamified ? 'bg-violet-500 hover:bg-violet-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all bouncy col-span-2`}
                    >
                      <IconCheck className="w-3 h-3" /> {user.isGamified ? 'Eat Item' : 'Consumed'}
                    </button>
                    <button 
                      onClick={() => onAction(item, 'composted')}
                      className={`py-2 ${user.isGamified ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-indigo-500 hover:bg-indigo-600'} text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all bouncy`}
                    >
                      <IconLeaf className="w-3 h-3" /> {user.isGamified ? 'Eco-Recycle' : 'Compost'}
                    </button>
                    <button 
                      onClick={() => onAction(item, 'tossed')}
                      className="py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all bouncy"
                    >
                      <IconTrash className="w-3 h-3" /> {user.isGamified ? 'Discard' : 'Tossed'}
                    </button>
                 </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`fridge-door absolute inset-0 bg-white dark:bg-slate-800 border-l-[12px] ${user.isGamified ? 'border-amber-800/10' : 'border-slate-100 dark:border-slate-700'} flex flex-col items-center justify-center space-y-8 shadow-2xl ${isOpen ? 'open' : ''}`}>
           <div className={`w-2 h-40 ${user.isGamified ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'} rounded-full mb-10 shadow-inner`}></div>
           <div className="text-center space-y-3 opacity-20 group">
              <IconHome className="w-16 h-16 mx-auto group-hover:scale-110 transition-transform" />
              <p className="text-[10px] font-black uppercase tracking-[0.8em]">{user.isGamified ? 'MAGIC LOCK' : 'BIOMETRIC LOCK'}</p>
           </div>
        </div>
      </div>

      {showAddMenu && (
        <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className={`max-w-xl w-full bg-white dark:bg-slate-800 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} p-10 space-y-8 shadow-3xl overflow-y-auto max-h-[90vh]`}>
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">{user.isGamified ? 'Inventory Add' : 'New Asset Protocol'}</h3>
              <button onClick={() => setShowAddMenu(false)} className="p-2 hover:bg-slate-100 rounded-full bouncy"><IconX className="w-6 h-6" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setManualEntry(true); setShowAddMenu(false); }} className={`p-8 border-2 ${user.isGamified ? 'border-violet-100 hover:bg-violet-50' : 'border-emerald-100 hover:bg-emerald-50'} dark:border-slate-800 rounded-blob transition-all flex flex-col items-center gap-4 group bouncy`}>
                <IconPlus className={`w-10 h-10 ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} group-hover:scale-110 transition-transform`} />
                <span className="text-xs font-black uppercase tracking-widest italic text-center">{user.isGamified ? 'Type Info' : 'Manual Entry'}</span>
              </button>
              <div className="relative">
                <ImageUpload isLoading={loadingScan} onImageSelected={handleFileUpload} />
                <div className={`absolute top-2 left-2 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white text-[8px] font-black px-2 py-1 rounded-full uppercase`}>{user.isGamified ? 'Magic Scan' : 'Neural Scan'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {manualEntry && (
        <div className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in slide-in-from-bottom-4">
          <div className={`max-w-md w-full bg-white dark:bg-slate-800 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} p-10 space-y-6 shadow-3xl overflow-y-auto max-h-[90vh]`}>
             <div className="flex justify-between items-center">
               <h3 className="text-xl font-black uppercase italic tracking-tighter">{user.isGamified ? 'Item Details' : 'Asset Entry'}</h3>
               <button onClick={() => setManualEntry(false)} className="p-2 hover:bg-slate-100 rounded-full bouncy"><IconX className="w-5 h-5" /></button>
             </div>
             <AddAssetView user={user} onCancel={() => setManualEntry(false)} onAdd={(i) => { onAdd(i); setManualEntry(false); onRefresh(); }} onKeyPrompt={onKeyPrompt} />
          </div>
        </div>
      )}

      {scanResult && (
        <ResultVerificationModal 
          user={user}
          scanResult={scanResult} 
          onAdd={(i) => { onAdd(i); setScanResult(null); setShowAddMenu(false); onRefresh(); }} 
          onClose={() => setScanResult(null)} 
        />
      )}

      {editingItem && (
        <EditItemModal 
          user={user}
          item={editingItem} 
          onUpdate={(i) => { onUpdate(i); setEditingItem(null); onRefresh(); }} 
          onClose={() => setEditingItem(null)} 
        />
      )}
    </div>
  );
};

// --- Edit Item Modal ---
const EditItemModal: React.FC<{ user: UserProfile, item: FoodItem, onUpdate: (i: FoodItem) => void, onClose: () => void }> = ({ user, item, onUpdate, onClose }) => {
  const [editName, setEditName] = useState(item.name);
  const [editExpiry, setEditExpiry] = useState(item.expiryDate);
  const [editLocation, setEditLocation] = useState<StorageLocation>(item.storageLocation);
  const [editCalories, setEditCalories] = useState<number>(item.calories || 0);
  const [editQuantity, setEditQuantity] = useState<number>(item.quantity || 1);
  const [editPrice, setEditPrice] = useState<number>(item.estimatedPrice || 0);

  return (
    <div className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in-95">
      <div className={`max-w-md w-full bg-white dark:bg-slate-900 ${user.isGamified ? 'rounded-mega-blob border-violet-100' : 'rounded-[3rem] border-slate-100'} p-10 space-y-6 shadow-3xl border dark:border-slate-800`}>
        <div className="flex justify-between items-center">
          <h3 className={`text-xl font-black uppercase italic tracking-tighter ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'}`}>{user.isGamified ? 'Edit Item' : 'Modify Asset'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors bouncy"><IconX className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
           <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Item Name' : 'Asset Designation'}</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none transition-all`} />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Quantity</label>
                 <input type="number" value={editQuantity} onChange={e => setEditQuantity(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Gold Cost' : 'Price per Unit'}</label>
                 <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
              </div>
           </div>
           <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Power Points (Calories)' : 'Calories per Serving'}</label>
              <input type="number" value={editCalories} onChange={e => setEditCalories(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Spoils In' : 'Expiry Point'}</label>
                 <input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-bold border-2 border-slate-100 dark:border-slate-700" />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Storage' : 'Sector'}</label>
                 <select value={editLocation} onChange={e => setEditLocation(e.target.value as StorageLocation)} className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-bold border-2 border-slate-100 dark:border-slate-700">
                    <option value="Fridge">Fridge</option>
                    <option value="Freezer">Freezer</option>
                    <option value="Pantry">Pantry</option>
                 </select>
              </div>
           </div>
           <button onClick={() => onUpdate({ ...item, name: editName, expiryDate: editExpiry, storageLocation: editLocation, calories: editCalories, quantity: editQuantity, estimatedPrice: editPrice })} className={`w-full py-5 ${user.isGamified ? 'bg-violet-600 rounded-mega-blob' : 'bg-emerald-600 rounded-3xl'} text-white font-black uppercase tracking-widest italic shadow-xl hover:opacity-90 transition-all bouncy`}>Confirm Change</button>
        </div>
      </div>
    </div>
  );
};

// --- Result Verification Modal ---
const ResultVerificationModal: React.FC<{ user: UserProfile, scanResult: ScanResult, onAdd: (i: FoodItem) => void, onClose: () => void }> = ({ user, scanResult, onAdd, onClose }) => {
  const [editName, setEditName] = useState(scanResult.name);
  const [editExpiry, setEditExpiry] = useState(scanResult.expiryDate);
  const [editLocation, setEditLocation] = useState<StorageLocation>(scanResult.storageLocation);
  const [editCalories, setEditCalories] = useState<number>(scanResult.calories || 0);
  const [editQuantity, setEditQuantity] = useState<number>(scanResult.quantity || 1);
  const [editPrice, setEditPrice] = useState<number>(scanResult.estimatedPrice || 0);

  return (
    <div className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in-95">
      <div className={`max-w-md w-full bg-white dark:bg-slate-900 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} p-10 space-y-6 shadow-3xl border border-slate-100 dark:border-slate-800`}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black uppercase italic tracking-tighter">{user.isGamified ? 'Identify Loot' : 'Neural Verification'}</h3>
            {scanResult.mouldDetected && <p className="text-[10px] font-black text-red-500 uppercase animate-pulse mt-1">! MOULD DETECTED !</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors bouncy"><IconX className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
           {scanResult.mouldDetected && (
             <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-bounce">
               <span className="text-2xl">⚠️</span>
               <p className="text-xs font-black text-red-600 uppercase tracking-tight leading-tight">Mould Warning: Biological integrity compromised. High accuracy vision scan detected fungal spores.</p>
             </div>
           )}
           <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Detected Item' : 'Detected Designation'}</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none transition-all`} />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Quantity</label>
                 <input type="number" value={editQuantity} onChange={e => setEditQuantity(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Gold' : 'Price'}</label>
                 <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
              </div>
           </div>
           <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Magic Power' : 'Calories'}</label>
              <input type="number" value={editCalories} onChange={e => setEditCalories(Number(e.target.value))} className={`w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-black focus:border-violet-500 outline-none`} />
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Spoils In' : 'Expiry Window'}</label>
                 <input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-bold border-2 border-slate-100 dark:border-slate-700" />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Chest' : 'Sector'}</label>
                 <select value={editLocation} onChange={e => setEditLocation(e.target.value as StorageLocation)} className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-xs font-bold border-2 border-slate-100 dark:border-slate-700">
                    <option value="Fridge">Fridge</option>
                    <option value="Freezer">Freezer</option>
                    <option value="Pantry">Pantry</option>
                 </select>
              </div>
           </div>
           <button onClick={() => onAdd({ ...scanResult, name: editName, expiryDate: editExpiry, storageLocation: editLocation, calories: editCalories, quantity: editQuantity, estimatedPrice: editPrice, id: Date.now().toString(), addedDate: new Date().toISOString() })} className={`w-full py-5 ${user.isGamified ? 'bg-violet-600 rounded-mega-blob' : 'bg-emerald-600 rounded-3xl'} text-white font-black uppercase tracking-widest italic shadow-xl hover:opacity-90 transition-all bouncy`}>{user.isGamified ? 'Collect Reward' : 'Log to Sector'}</button>
        </div>
      </div>
    </div>
  );
};

// --- Recipes View ---
const RecipesView: React.FC<{ inventory: FoodItem[], user: UserProfile }> = ({ inventory, user }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const fetchRecipes = async () => {
    if (inventory.length === 0) return;
    setLoading(true);
    try {
      const results = await GeminiService.generateRecipes(inventory);
      setRecipes(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (recipes.length === 0 && inventory.length > 0) {
      fetchRecipes();
    }
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className={`flex flex-col md:flex-row justify-between items-center gap-6 bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} border border-slate-100 dark:border-slate-700 shadow-sm`}>
        <div className="text-center md:text-left space-y-2">
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">{user.isGamified ? 'CULINARY QUESTS' : 'NEURAL ENGINE'}</h2>
          <p className="text-sm text-slate-500 font-medium">{user.isGamified ? 'Complete quests with your inventory loot!' : 'Synthesizing recipes using biological assets.'}</p>
        </div>
        <button 
          onClick={fetchRecipes} 
          disabled={loading || inventory.length === 0}
          className={`px-10 py-5 ${user.isGamified ? 'bg-violet-600 rounded-blob' : 'bg-emerald-600 rounded-2xl'} text-white font-black shadow-xl bouncy italic uppercase tracking-widest text-[10px] disabled:opacity-50`}
        >
          {loading ? 'Synthesizing...' : (user.isGamified ? 'Roll New Quests' : 'Refresh Recipes')}
        </button>
      </div>

      {inventory.length === 0 ? (
        <div className="text-center py-20 opacity-20 flex flex-col items-center gap-4 grayscale">
          <IconChef className="w-20 h-20" />
          <p className="text-lg font-black uppercase tracking-[0.5em]">{user.isGamified ? 'Loot Box Empty' : 'Sector Offline'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
             Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={`bg-white dark:bg-slate-800 h-64 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} animate-pulse border border-slate-100 dark:border-slate-700`}></div>
             ))
          ) : recipes.map(recipe => (
            <button 
              key={recipe.id} 
              onClick={() => setSelectedRecipe(recipe)}
              className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-mega-blob border-amber-100' : 'rounded-[3rem] border-slate-100'} border dark:border-slate-700 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all text-left flex flex-col justify-between group bouncy`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <h3 className={`text-xl font-black italic uppercase tracking-tight group-hover:text-violet-600 transition-colors leading-tight`}>{recipe.title}</h3>
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${recipe.difficulty === 'Easy' ? 'bg-green-50 border-green-200 text-green-600' : recipe.difficulty === 'Medium' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
                    {recipe.difficulty}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{recipe.description}</p>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 dark:border-slate-700 flex justify-between items-center">
                 <span className="text-[10px] font-black uppercase text-slate-400">{recipe.prepTime}</span>
                 <span className={`text-[10px] font-black uppercase ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'}`}>{recipe.caloriesPerServing} PP</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedRecipe && (
        <div className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className={`max-w-2xl w-full bg-white dark:bg-slate-900 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} p-10 space-y-8 shadow-3xl border border-slate-100 dark:border-slate-800 overflow-y-auto max-h-[90vh] no-scrollbar`}>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className={`text-3xl font-black italic uppercase tracking-tighter leading-none ${user.isGamified ? 'text-violet-600' : ''}`}>{selectedRecipe.title}</h3>
                <p className={`${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} text-xs font-black uppercase tracking-widest`}>{selectedRecipe.difficulty} • {selectedRecipe.prepTime} • {selectedRecipe.caloriesPerServing} PP</p>
              </div>
              <button onClick={() => setSelectedRecipe(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors bouncy"><IconX className="w-6 h-6" /></button>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2">{user.isGamified ? 'REQUIRED LOOT' : 'COMPONENTS'}</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedRecipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm font-medium italic text-slate-700 dark:text-slate-300">
                      <div className={`w-1.5 h-1.5 ${user.isGamified ? 'bg-violet-500' : 'bg-emerald-500'} rounded-full`}></div>
                      {ing}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2">{user.isGamified ? 'QUEST STEPS' : 'PROTOCOL'}</h4>
                <ol className="space-y-6">
                  {selectedRecipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-6 items-start">
                      <span className={`w-8 h-8 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xs font-black ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} shrink-0 border border-slate-100 dark:border-slate-700`}>{i + 1}</span>
                      <p className="text-sm font-medium leading-relaxed dark:text-slate-100">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <button 
              onClick={() => setSelectedRecipe(null)} 
              className={`w-full py-5 ${user.isGamified ? 'bg-violet-600 rounded-mega-blob' : 'bg-emerald-600 rounded-3xl'} text-white font-black uppercase tracking-widest italic shadow-xl hover:opacity-90 transition-all bouncy`}
            >
              {user.isGamified ? 'Quest Complete' : 'Recipe Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Welcome View ---
const WelcomeView: React.FC<{ hasApiKey: boolean, onKeySelected: () => void, onComplete: (data: any) => void }> = ({ hasApiKey, onKeySelected, onComplete }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="min-h-screen bg-emerald-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] space-y-8 shadow-2xl border border-slate-100 dark:border-slate-800">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-emerald-200 bouncy">🧊</div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Fridgeometer</h2>
          <p className="text-slate-500 text-sm">Sustainable Kitchen Assistant</p>
        </div>
        <div className="space-y-4">
          {!isLogin && (
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white" placeholder="Name" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white" placeholder="Email" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white" placeholder="Password" />
        </div>
        <button 
          onClick={() => onComplete({ name: name || email.split('@')[0], email, language: 'English', tempUnit: 'Celsius', distUnit: 'km', country: 'US' })}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition-all bouncy"
        >
          {isLogin ? 'Establish Link' : 'Register Protocol'}
        </button>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full text-xs font-bold text-slate-500 hover:text-emerald-600 transition-colors uppercase tracking-widest">
          {isLogin ? "Need a Protocol? Sign Up" : "Have a Link? Log In"}
        </button>
      </div>
    </div>
  );
};

// --- Add Asset View ---
const AddAssetView: React.FC<{ user: UserProfile, onCancel: () => void, onAdd: (item: FoodItem) => void, onKeyPrompt: () => Promise<boolean> }> = ({ user, onCancel, onAdd, onKeyPrompt }) => {
  const [form, setForm] = useState({ name: '', exp: new Date().toISOString().split('T')[0], location: 'Fridge' as StorageLocation, category: 'Produce' as Category, calories: 0, quantity: 1, estimatedPrice: 0 });
  const [searchingData, setSearchingData] = useState(false);

  const lookupAssetData = async () => {
    if (!form.name) return;
    setSearchingData(true);
    try {
      const pricePromise = GeminiService.estimateItemPrice(form.name);
      const caloriePromise = GeminiService.estimateItemCalories(form.name);
      const [price, calories] = await Promise.all([pricePromise, caloriePromise]);
      setForm(p => ({ ...p, estimatedPrice: price, calories: calories }));
    } finally {
      setSearchingData(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className={`bg-slate-50 dark:bg-slate-900/40 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-3xl'} border border-slate-100 dark:border-slate-700 space-y-6`}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Item Name' : 'Designation'}</label>
            <div className="flex gap-2">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={`flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-violet-500 outline-none transition-all`} placeholder="e.g., Organic Honey" />
              <button onClick={lookupAssetData} disabled={searchingData || !form.name} className={`px-4 ${user.isGamified ? 'bg-violet-500' : 'bg-blue-500'} text-white rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 bouncy`}>
                {searchingData ? '...' : (user.isGamified ? 'Find Magic' : 'Neural Search')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Value ($)' : 'Unit Price ($)'}</label>
              <input type="number" step="0.01" value={form.estimatedPrice} onChange={e => setForm(p => ({ ...p, estimatedPrice: parseFloat(e.target.value) }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-violet-500 outline-none`} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Quantity</label>
              <input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: parseInt(e.target.value) }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-violet-500 outline-none`} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Power (Calories)' : 'Calories per Serving'}</label>
            <input type="number" value={form.calories} onChange={e => setForm(p => ({ ...p, calories: Number(e.target.value) }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-violet-500 outline-none`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Type</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as Category }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-4 py-4 text-xs font-bold outline-none`}>
                <option value="Produce">Produce</option>
                <option value="Dairy">Dairy</option>
                <option value="Meat">Meat</option>
                <option value="Beverage">Beverage</option>
                <option value="Grains">Grains</option>
                <option value="Canned">Canned</option>
                <option value="Snacks">Snacks</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Chest' : 'Sector'}</label>
              <select value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value as StorageLocation }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-4 py-4 text-xs font-bold outline-none`}>
                <option value="Fridge">Fridge</option>
                <option value="Freezer">Freezer</option>
                <option value="Pantry">Pantry</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">{user.isGamified ? 'Spoils In' : 'Expiry Window'}</label>
            <input type="date" value={form.exp} onChange={e => setForm(p => ({ ...p, exp: e.target.value }))} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold outline-none`} />
          </div>
        </div>
        <div className="flex gap-4 pt-4">
           <button onClick={onCancel} className="flex-1 py-4 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl uppercase tracking-widest text-[10px] italic bouncy">Cancel</button>
           <button onClick={() => onAdd({ id: Date.now().toString(), name: form.name || 'UNIDENTIFIED', category: form.category, expiryDate: form.exp, quantity: form.quantity, unit: 'pcs', storageLocation: form.location, addedDate: new Date().toISOString(), mouldDetected: false, calories: form.calories, estimatedPrice: form.estimatedPrice })} className={`flex-[2] py-4 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white font-black rounded-2xl uppercase tracking-widest italic shadow-xl active:scale-95 transition-all text-[10px] bouncy`}>{user.isGamified ? 'Confirm Loot' : 'Finalize Entry'}</button>
        </div>
      </div>
    </div>
  );
};

// --- ScannerView: Updated with dynamic terms ---
const ScannerView: React.FC<{ 
  user: UserProfile, 
  onAdd: (i: FoodItem) => void, 
  onError: (msg: string) => void, 
  isNeuralSyncEnabled: boolean, 
  onKeyPrompt: () => Promise<boolean> 
}> = ({ user, onAdd, onError, isNeuralSyncEnabled, onKeyPrompt }) => {
  const [active, setActive] = useState(false);
  const [analysisText, setAnalysisText] = useState(user.isGamified ? "Waiting for item..." : "Awaiting identification...");
  const [objectName, setObjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [mouldAlert, setMouldAlert] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => stopScanner();
  }, []);

  useEffect(() => {
    if (!isNeuralSyncEnabled && active) {
      stopScanner();
    }
  }, [isNeuralSyncEnabled]);

  const stopScanner = () => {
    setActive(false);
    setMouldAlert(false);
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e) {} sessionRef.current = null; }
    if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
    for (const source of sourcesRef.current) { try { source.stop(); } catch(e) {} }
    sourcesRef.current.clear();
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} audioCtxRef.current = null; }
    if (micCtxRef.current) { try { micCtxRef.current.close(); } catch(e) {} micCtxRef.current = null; }
    nextStartTimeRef.current = 0;
  };

  const startScanner = async () => {
    if (!isNeuralSyncEnabled) {
      onError(user.isGamified ? "Magic Voice is off! Turn it on in the header." : "Neural Sync is disabled.");
      return;
    }
    setActive(true); setLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setLoading(false);
            setAnalysisText(user.isGamified ? "Magic sensor online! Show me your food." : "Neural sensor online. Point at food.");
            
            const interval = setInterval(() => {
              if (!sessionRef.current || !videoRef.current || !canvasRef.current) { clearInterval(interval); return; }
              const ctx = canvasRef.current.getContext('2d');
              canvasRef.current.width = 400; canvasRef.current.height = 300;
              ctx?.drawImage(videoRef.current, 0, 0, 400, 300);
              canvasRef.current.toBlob(blob => {
                if (blob) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    sessionPromise.then(s => { if (sessionRef.current) s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }); });
                  };
                  reader.readAsDataURL(blob);
                }
              }, 'image/jpeg', 0.5);
            }, 2000);

            micCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const micSource = micCtxRef.current.createMediaStreamSource(stream);
            const scriptNode = micCtxRef.current.createScriptProcessor(4096, 1, 1);
            scriptNode.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) { int16[i] = inputData[i] * 32768; }
              const base64 = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => { if (sessionRef.current) s.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }); });
            };
            micSource.connect(scriptNode);
            scriptNode.connect(micCtxRef.current.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioOut = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioOut && audioCtxRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtxRef.current.currentTime);
              const buffer = await decodeAudioData(decode(audioOut), audioCtxRef.current, 24000, 1);
              const srcNode = audioCtxRef.current.createBufferSource();
              srcNode.buffer = buffer; srcNode.connect(audioCtxRef.current.destination);
              srcNode.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(srcNode);
              srcNode.onended = () => sourcesRef.current.delete(srcNode);
            }
            if (msg.serverContent?.outputTranscription) {
              const text = msg.serverContent.outputTranscription.text.toLowerCase();
              setAnalysisText(text);
              
              // NEW: Real-time mould detection flagging
              if (text.includes('mould') || text.includes('mold') || text.includes('spoil') || text.includes('fuzzy')) {
                setMouldAlert(true);
              } else {
                setMouldAlert(false);
              }

              const match = text.match(/(?:identified|see|is|this|it)\s+([a-zA-Z\s]{3,15})(?:\s+is|\.|\s+in)/i);
              if (match && match[1]) { setObjectName(match[1].trim()); }
            }
          },
          onerror: (e) => { console.error(e); stopScanner(); },
          onclose: stopScanner
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: user.isGamified 
            ? "You are a friendly magic food fairy. Identify loot items and tell the player what they've found. Be excited! MOST IMPORTANT: If you see ANY mould, fuzzy spots, or spores, warn the player IMMEDIATELY about the biological hazard." 
            : "Identify food items with extreme precision. Distinquish brands and variety. Report orally. PRIORITY: Surface analysis for spoilage and mould. If detected, issue a high-priority warning."
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) { 
      if (e.message?.includes('PERMISSION_DENIED')) onKeyPrompt().then(s => s && startScanner());
      stopScanner(); 
    }
  };

  const captureFullAnalysis = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    // Check for paid API key for deep molecular scan
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
    if (!hasKey) {
      const selected = await onKeyPrompt();
      if (!selected) return;
    }

    setLoading(true); setScanResult(null);
    try {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = 1280; canvasRef.current.height = 960; 
      ctx?.drawImage(videoRef.current, 0, 0, 1280, 960);
      const blob = await new Promise<Blob>(r => canvasRef.current!.toBlob(b => r(b!), 'image/jpeg', 0.95));
      const b64 = await new Promise<string>(r => {
        const reader = new FileReader();
        reader.onloadend = () => r((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const res = await GeminiService.analyzeFoodImage(b64);
      setScanResult(res);
      // Trigger the vocal report
      await GeminiService.speakStatusReport(res, user.isGamified);
    } catch (err: any) {
      if (err.message?.includes('PERMISSION_DENIED')) onKeyPrompt().then(s => s && captureFullAnalysis());
      else onError(user.isGamified ? "Magic scan failed!" : "Deep molecular analysis failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4">
      <h2 className="text-3xl font-black italic tracking-tighter uppercase">{user.isGamified ? 'SCAN QUEST' : 'NEURAL HUB'}</h2>
      <div className={`relative aspect-video bg-black ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[2.5rem]'} overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800`}>
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-slate-50 dark:bg-slate-900">
            <IconCamera className="w-16 h-16 opacity-10" />
            <button onClick={startScanner} className={`px-10 py-4 ${user.isGamified ? 'bg-violet-600 rounded-blob' : 'bg-emerald-600 rounded-2xl'} text-white font-bold shadow-xl bouncy transition-all`}>{user.isGamified ? 'Activate Magic Link' : 'Engage Neural Link'}</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className={`scan-line ${mouldAlert ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : ''}`}></div>
            
            {mouldAlert && (
              <div className="absolute inset-0 pointer-events-none border-[12px] border-red-500/40 animate-pulse z-20"></div>
            )}

            {objectName && (
              <div className={`absolute top-10 left-1/2 -translate-x-1/2 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} px-6 py-2 rounded-full text-white font-bold text-xs shadow-2xl animate-bounce z-30`}>
                {mouldAlert ? '⚠️ BIOHAZARD DETECTED' : objectName}
              </div>
            )}
            <div className={`absolute bottom-6 left-6 right-20 bg-white/90 dark:bg-slate-800/90 p-4 rounded-2xl shadow-xl flex items-center gap-4 border z-30 ${mouldAlert ? 'border-red-500' : (user.isGamified ? 'border-violet-100' : 'border-emerald-100')}`}>
              <IconMic className={`w-4 h-4 ${mouldAlert ? 'text-red-500' : (user.isGamified ? 'text-violet-600' : 'text-emerald-600')} animate-pulse`} />
              <p className={`text-[10px] font-bold italic line-clamp-2 ${mouldAlert ? 'text-red-600' : ''}`}>{analysisText}</p>
            </div>
            <button onClick={captureFullAnalysis} disabled={loading} className={`absolute bottom-6 right-6 p-4 ${mouldAlert ? 'bg-red-600' : (user.isGamified ? 'bg-violet-600' : 'bg-emerald-600')} text-white rounded-full shadow-2xl bouncy flex items-center justify-center hover:opacity-90 disabled:opacity-50 z-30`}>
              <IconSearch className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-400 font-bold uppercase text-center tracking-widest italic animate-pulse">
        {mouldAlert ? 'WARNING: Spoilage patterns detected!' : (user.isGamified ? 'Searching for loot items...' : 'Scanning for biological assets...')}
      </p>
      
      {scanResult && (
        <ResultVerificationModal 
          user={user}
          scanResult={scanResult} 
          onAdd={onAdd} 
          onClose={() => setScanResult(null)} 
        />
      )}
    </div>
  );
};

/**
 * ChatHub: Direct neural uplink with the Fridgeometer AI.
 */
const ChatHub: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<Chat | null>(null);

  useEffect(() => {
    chatRef.current = GeminiService.createChatSession(user.language);
  }, [user.language]);

  const sendMessage = async () => {
    if (!input.trim() || !chatRef.current) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await chatRef.current.sendMessage({ message: input });
      const modelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response.text || 'Protocol anomaly detected.' };
      setMessages(prev => [...prev, modelMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: user.isGamified ? "Uplink down! Check your magic link." : "Neural uplink interrupted." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`max-w-2xl mx-auto h-[600px] flex flex-col bg-white dark:bg-slate-800 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4`}>
      <div className={`p-8 border-b border-slate-100 dark:border-slate-700 flex items-center gap-4 ${user.isGamified ? 'bg-violet-50 dark:bg-violet-950/20' : 'bg-emerald-50 dark:bg-emerald-950/20'}`}>
         <div className={`w-12 h-12 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg bouncy`}>🤖</div>
         <div>
           <h3 className="text-xl font-black uppercase italic tracking-tighter">{user.isGamified ? 'Magic AI Guide' : 'Neural Assistant Hub'}</h3>
           <p className={`text-[10px] font-black ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} uppercase tracking-widest`}>Protocol: Secure Link Active</p>
         </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-10 grayscale">
            <IconChat className="w-20 h-20" />
            <p className="text-sm font-black uppercase tracking-[1em] italic">Waiting for Input</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm font-medium leading-relaxed shadow-sm ${m.role === 'user' ? (user.isGamified ? 'bg-violet-600 text-white rounded-tr-none' : 'bg-emerald-600 text-white rounded-tr-none') : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-none'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className={`text-[10px] font-black ${user.isGamified ? 'text-violet-600' : 'text-emerald-600'} uppercase animate-pulse tracking-widest`}>Thinking...</div>}
      </div>
      <div className="p-6 bg-slate-50 dark:bg-slate-900/50 flex gap-3 border-t border-slate-100 dark:border-slate-700">
        <input 
          value={input} 
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={user.isGamified ? "Ask for a tip..." : "Issue command..."}
          className={`flex-1 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 ${user.isGamified ? 'rounded-blob' : 'rounded-2xl'} px-6 py-4 text-sm font-bold focus:border-violet-500 outline-none transition-all dark:text-white`}
        />
        <button onClick={sendMessage} className={`w-14 h-14 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} text-white rounded-2xl flex items-center justify-center shadow-lg bouncy`}>
          <IconSend className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

/**
 * ProfileHub: Updated with flavor text
 */
const ProfileHub: React.FC<{ user: UserProfile, onUpdate: (u: UserProfile) => void, onLogout: () => void }> = ({ user, onUpdate, onLogout }) => {
  return (
    <div className="max-w-2xl auto space-y-10 animate-in fade-in duration-500">
      <div className={`bg-white dark:bg-slate-800 p-10 ${user.isGamified ? 'rounded-mega-blob' : 'rounded-[3rem]'} border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center space-y-6`}>
        <div className={`w-24 h-24 ${user.isGamified ? 'bg-violet-600' : 'bg-emerald-600'} rounded-full flex items-center justify-center text-4xl text-white font-black shadow-xl border-8 border-white dark:border-slate-800 uppercase bouncy`}>{user.name[0]}</div>
        <div className="space-y-1">
          <h2 className="text-3xl font-black italic uppercase tracking-tighter">{user.name}</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{user.isGamified ? "Earth Hero" : "Sustainability Agent"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[2.5rem]'} border border-slate-100 dark:border-slate-700 shadow-sm space-y-6`}>
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 dark:border-slate-700 pb-2">Interface Mode</h3>
          <div className="space-y-6">
             <div className="flex justify-between items-center">
                <span className="text-sm font-bold italic uppercase tracking-tight">App Scale</span>
                <select 
                  value={user.appScale} 
                  onChange={e => onUpdate(StorageService.updateProfile({ appScale: e.target.value as any })!)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[10px] font-black uppercase"
                >
                  <option value="small">Compact</option>
                  <option value="medium">Standard</option>
                  <option value="large">Big</option>
                </select>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-sm font-bold italic uppercase tracking-tight">Gamified Overlay</span>
                <button 
                  onClick={() => onUpdate(StorageService.updateProfile({ isGamified: !user.isGamified })!)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all bouncy ${user.isGamified ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'}`}
                >
                  {user.isGamified ? 'Active' : 'Offline'}
                </button>
             </div>
          </div>
        </div>

        <div className={`bg-white dark:bg-slate-800 p-8 ${user.isGamified ? 'rounded-blob' : 'rounded-[2.5rem]'} border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between`}>
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 dark:border-slate-700 pb-2">Account Management</h3>
          <div className="pt-6 space-y-4">
            <button onClick={onLogout} className="w-full py-5 bg-red-50 text-red-600 border border-red-100 dark:bg-red-950/20 rounded-2xl font-black uppercase tracking-widest text-[10px] italic hover:bg-red-100 transition-colors bouncy shadow-sm">Logout</button>
            <p className="text-[9px] text-slate-400 font-bold text-center uppercase tracking-widest">Joined: {new Date(user.joinedDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
