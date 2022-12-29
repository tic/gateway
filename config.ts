/* eslint-disable import/prefer-default-export */
import {
  config as dotenvConfig, DotenvParseOutput,
} from 'dotenv';
import {
  ConfigType,
  GlobalConfigType,
} from './types/globalTypes';
import { SifConfigType } from './types/sinkSifTypes';
import { EcoVacsConfigType } from './types/sourceEcovacsTypes';
import { MachineUsageConfigType } from './types/sourceMachineUsageTypes';
import { NutConfigType } from './types/sourceNutTypes';

export const getConfig = (): GlobalConfigType => {
  const envFile: DotenvParseOutput | undefined = dotenvConfig().parsed;
  if (envFile === undefined) {
    throw new Error('failed to load env file');
  }
  const missingKeys: string[] = [];
  const env = (key: string) : string => {
    const value = envFile[key];
    if (value === undefined) {
      missingKeys.push(key);
      return '';
    }
    return value;
  };

  // The config is separated by the various files it needs to read from
  const config: GlobalConfigType = {
    disableSinks: env('DISABLE_SINKS') === 'true',
    sourceWhitelist: env('SOURCE_WHITELIST') === '' ? [] : env('SOURCE_WHITELIST').split(','),
    sourceBlacklist: env('SOURCE_BLACKLIST') === '' ? [] : env('SOURCE_BLACKLIST').split(','),
    sinks: {
      sif: {
        username: env('SIF_USERNAME'),
        password: env('SIF_PASSWORD'),
        clientId: env('SIF_CLIENTID'),
        userPoolId: env('SIF_USERPOOLID'),
        brokerAddress: env('SIF_BROKER_ADDRESS'),
      } as SifConfigType,
      influx: {
        token: env('INFLUX_TOKEN'),
        url: env('INFLUX_URL'),
        org: env('INFLUX_ORG'),
        bucket: env('INFLUX_BUCKET'),
      },
    },
    sources: {
      machineUsage: {
        collectionPeriodMs: parseInt(env('MACHINEUSAGE_COLLECTION_PERIOD_MS'), 10) || 60000,
        freeTimePercentage: parseInt(env('MACHINEUSAGE_FREE_TIME_PCT'), 10) || 5,
      } as MachineUsageConfigType,
      ecovacs: {
        email: env('ECOVACS_EMAIL'),
        password: env('ECOVACS_PASSWORD'),
        country: env('ECOVACS_COUNTRY'),
      } as EcoVacsConfigType,
      nut: {
        serverAddress: env('NUT_ADDRESS'),
        serverPort: env('NUT_PORT'),
        autoReconnectTimeoutMs: parseInt(env('NUT_CONNECTION_TIMEOUT_MS'), 10) || 30000,
        collectionIntervalMs: parseInt(env('NUT_COLLECTION_PERIOD_MS'), 10) || 30000,
        connectionRetryCooldownMs: parseInt(env('NUT_CONNECTION_RETRY_COOLDOWN_MS'), 10) || 60000,
      } as NutConfigType,
      http: {
        serverPort: env('HTTP_PORT'),
      } as ConfigType,
    },
  };
  if (missingKeys.length > 0) {
    console.warn('!!! WARNING: the config referenced environment variables that were not found in the .env file:');
    console.warn(`\t- ${missingKeys.join('\n\t- ')}\n`);
  }
  return config;
};
