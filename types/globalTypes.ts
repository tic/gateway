/* eslint-disable no-unused-vars */
export type configType = Record<string, string | number>;

export interface globalConfigType {
  disableSinks: boolean,
  sourceWhitelist: string[],
  sourceBlacklist: string[],
  sinks: Record<string, configType>,
  sources: Record<string, configType>,
};

export interface sinkType {
  drain: () => Promise<boolean>,
  setup: (arg0: configType) => Promise<{
    success: boolean;
    message?: string;
  }>,
  cleanup: () => Promise<boolean>,
};

export type sinkDictionary = Record<string, sinkType>;
export interface sourceType {
  setup: (arg0: configType, arg1: sinkDictionary) => Promise<boolean>;
  cleanup: () => Promise<boolean>,
};
export type sourceDictionary = Record<string, sourceType>;
