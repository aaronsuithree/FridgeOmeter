import { GoogleGenAI, Type, Chat, GenerateContentResponse, Modality } from "@google/genai";
import { ScanResult, Category, StorageLocation, FoodItem, SearchResponse, PlaceResult, MealSuggestion, Recipe } from "../types";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });

const fastModelId = "gemini-3-flash-preview";
const complexModelId = "gemini-3-pro-preview";
const mapsModelId = "gemini-2.5-flash";
const visionProModelId = "gemini-3-pro-image-preview";
const ttsModelId = "gemini-2.5-flash-preview-tts";

const cleanJson = (text: string): string => {
  if (!text) return '{}';
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');
  let start = -1;
  let end = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = text.lastIndexOf(']');
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = text.lastIndexOf('}');
  }
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return text.replace(/```json\n?|\n?```/g, '').trim();
};

export const estimateItemPrice = async (itemName: string): Promise<number> => {
  const freshAi = getAi();
  const prompt = `Search and find the current average retail price (USD) for one unit of "${itemName}". 
  Provide ONLY the numerical value. If you find a range, provide the average. 
  If you cannot find it, return a reasonable estimate for a standard unit (e.g., $3.50 for a pack of milk).`;

  try {
    const response = await freshAi.models.generateContent({
      model: complexModelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    const match = (response.text || "").match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 5.0;
  } catch (error) {
    return 5.0;
  }
};

export const estimateItemCalories = async (itemName: string): Promise<number> => {
  const freshAi = getAi();
  const prompt = `Search and find the approximate calorie count for one standard unit or serving of "${itemName}". 
  Provide ONLY the numerical value. If you find a range, provide the average.`;

  try {
    const response = await freshAi.models.generateContent({
      model: complexModelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    const match = (response.text || "").match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  } catch (error) {
    return 0;
  }
};

export const analyzeFoodImage = async (base64Image: string): Promise<ScanResult> => {
  const freshAi = getAi();
  const prompt = `Act as the Fridgeometer Ultra-Precision Molecular Scanner. Your primary priority is food safety and mould detection.

  IMAGE ANALYSIS TASKS:
  1. **MOULD DETECTION**: Examine the surface textures with extreme scrutiny. Look for fuzz, discolored spores (green, white, black, blue), mycelium threads, or unusual textural slime. Cross-reference with known spoilage patterns for this item using 'googleSearch'.
  2. **BRAND & VARIETY**: Identify the exact brand and variety of the item.
  3. **PRICE LOGGING**: Find the current US market average unit price via 'googleSearch'.
  4. **NUTRITION**: Estimate calories per serving.
  5. **LOGISTICS**: Determine category and storage location.
  6. **EXPIRY**: Predict the safety window (YYYY-MM-DD).

  Be strictly objective. If there is even a 5% chance of mould, mark 'mouldDetected' as true.`;

  try {
    const response = await freshAi.models.generateContent({
      model: visionProModelId,
      contents: { parts: [{ inlineData: { mimeType: "image/jpeg", data: base64Image } }, { text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32000 }, // Max thinking for maximum accuracy
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            expiryDate: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Produce', 'Dairy', 'Meat', 'Beverage', 'Grains', 'Canned', 'Snacks', 'Other'] },
            storageLocation: { type: Type.STRING, enum: ['Fridge', 'Freezer', 'Pantry'] },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            brandInfo: { type: Type.STRING },
            mouldDetected: { type: Type.BOOLEAN },
            calories: { type: Type.INTEGER },
            estimatedPrice: { type: Type.NUMBER }
          },
          required: ["name", "category", "storageLocation", "quantity", "unit", "confidence", "mouldDetected", "calories", "expiryDate", "estimatedPrice"]
        }
      }
    });
    const text = response.text ?? '{}';
    return JSON.parse(cleanJson(text)) as ScanResult;
  } catch (error: any) { 
    console.error("Neural Scanner Failure:", error);
    throw error; 
  }
};

/**
 * Generate a vocal status report based on scan results.
 */
export const speakStatusReport = async (result: ScanResult, isGamified: boolean): Promise<void> => {
  const freshAi = getAi();
  const prompt = isGamified 
    ? `Tell the hero that we found ${result.name}! ${result.mouldDetected ? "Oh no! My magic sees icky mould on this. Please don't eat it!" : "It looks super fresh and magical. Safe to add to the loot chest!"}`
    : `Status report for ${result.name}. Mould detection: ${result.mouldDetected ? "POSITIVE. Surface decay detected. Disposal recommended." : "NEGATIVE. Molecular structure appears intact. Safe for consumption."}`;

  try {
    const response = await freshAi.models.generateContent({
      model: ttsModelId,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: isGamified ? 'Kore' : 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const decode = (base64: string) => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      };

      const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
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
      };

      const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start();
    }
  } catch (e) {
    console.error("TTS Output Error:", e);
  }
};

export const generateRecipes = async (items: FoodItem[]): Promise<Recipe[]> => {
  const freshAi = getAi();
  const inventoryList = items.map(i => i.name).join(', ');
  const prompt = `Act as the Fridgeometer Culinary Neural Engine. CURRENT ASSETS: ${inventoryList}. 
  Synthesize exactly 3 recipes using 'googleSearch'. Return ONLY a raw JSON array.`;

  try {
    const response = await freshAi.models.generateContent({
      model: complexModelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } },
              prepTime: { type: Type.STRING },
              difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard'] },
              caloriesPerServing: { type: Type.INTEGER }
            },
            required: ["id", "title", "description", "ingredients", "steps", "prepTime", "difficulty", "caloriesPerServing"]
          }
        }
      }
    });
    const text = response.text ?? '[]';
    return JSON.parse(cleanJson(text)) as Recipe[];
  } catch (error: any) {
    return [];
  }
};

export const createChatSession = (lang: string = "English") => {
  const freshAi = getAi();
  return freshAi.chats.create({
    model: complexModelId,
    config: { systemInstruction: `Fridgeometer Assistant. Language: ${lang}. Futuristic, robotic tone.` }
  });
};

export const generateMealPlan = async (items: FoodItem[]): Promise<MealSuggestion[]> => {
  const freshAi = getAi();
  const prompt = `Items: ${items.map(i => i.name).join(', ')}. Create 3-day meal strategy.`;
  try {
    const response = await freshAi.models.generateContent({
      model: complexModelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.STRING },
              breakfast: { type: Type.STRING },
              lunch: { type: Type.STRING },
              dinner: { type: Type.STRING },
              ingredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      }
    });
    const text = response.text ?? '[]';
    return JSON.parse(cleanJson(text)) as MealSuggestion[];
  } catch (e) { return []; }
};