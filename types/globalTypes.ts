/* eslint-disable no-unused-vars */
export type configType = Record<string, string | number>;

export interface globalConfigType {
  disableSinks: boolean,
  sourceWhitelist: string[],
  sourceBlacklist: string[],
  sinks: Record<string, configType>,
  sources: Record<string, configType>,
};

export type setupMessage = {
  success: boolean;
  message?: string;
};

export interface sinkType {
  drain: (...args: unknown[]) => Promise<boolean>,
  setup: (arg0: configType) => Promise<setupMessage>,
  cleanup: () => Promise<boolean>,
};

export type sinkDictionary = Record<string, sinkType>;

export interface sourceType {
  setup: (arg0: configType, arg1: sinkDictionary) => Promise<setupMessage>;
  cleanup: () => Promise<boolean>,
};

export type sourceDictionary = Record<string, sourceType>;
