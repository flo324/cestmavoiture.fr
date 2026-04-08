import React, { createContext, useContext, useMemo, useState } from 'react';
import { userGetItem, userSetItem } from '../services/userStorage';

type PendingImage = {
  uri: string;
  createdAt: number;
};

type SavedFolderImage = PendingImage & {
  folderName: string;
};

type ScanContextValue = {
  tempImage: PendingImage | null;
  isSelecting: boolean;
  setCapturedImageForSelection: (image: PendingImage | null) => void;
  clearSelection: () => void;
  saveImageToFolder: (folderName: string) => Promise<SavedFolderImage | null>;
};

const ScanContext = createContext<ScanContextValue | null>(null);

const folderStorageKey = (folderName: string) => `@scan_folder_images_${folderName}`;

export const ScanProvider = ({ children }: { children: React.ReactNode }) => {
  const [tempImage, setTempImage] = useState<PendingImage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const setCapturedImageForSelection = (image: PendingImage | null) => {
    console.log('[ScanContext] setCapturedImageForSelection', {
      hasImage: !!image,
      uri: image?.uri,
    });
    setTempImage(image);
    setIsSelecting(!!image);
  };

  const clearSelection = () => {
    console.log('[ScanContext] clearSelection');
    setTempImage(null);
    setIsSelecting(false);
  };

  const saveImageToFolder = async (folderName: string): Promise<SavedFolderImage | null> => {
    if (!tempImage) {
      console.log('[ScanContext] saveImageToFolder aborted: no temp image');
      return null;
    }

    const payload: SavedFolderImage = {
      folderName,
      uri: tempImage.uri,
      createdAt: Date.now(),
    };

    const key = folderStorageKey(folderName);
    console.log('[ScanContext] saveImageToFolder start', { folderName, key, uri: payload.uri });
    const existingRaw = await userGetItem(key);
    const existing = existingRaw ? (JSON.parse(existingRaw) as SavedFolderImage[]) : [];
    const next = [payload, ...existing];
    await userSetItem(key, JSON.stringify(next));
    console.log('[ScanContext] saveImageToFolder success', { folderName, count: next.length });
    return payload;
  };

  const value = useMemo(
    () => ({
      tempImage,
      isSelecting,
      setCapturedImageForSelection,
      clearSelection,
      saveImageToFolder,
    }),
    [tempImage, isSelecting]
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
};

export const useScan = () => {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error('useScan must be used inside ScanProvider');
  }
  return ctx;
};
