import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueueStore, UploadInit } from "@league/upload-core";

const QUEUE_KEY = "league_upload_queue";

export const createAsyncStorageQueueStore = (): QueueStore => {
  return {
    async load() {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) {
        return [];
      }
      try {
        return JSON.parse(raw) as UploadInit[];
      } catch {
        return [];
      }
    },
    async save(items) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    },
    async clear() {
      await AsyncStorage.removeItem(QUEUE_KEY);
    },
  };
};
