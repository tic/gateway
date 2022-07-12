/* eslint-disable import/prefer-default-export */
import {
  configType,
  globalConfigType,
} from './types/globalTypes';

const {
  config: dotenvConfig,
} = require('dotenv');

export const getConfig = (): globalConfigType => {
  const { parsed: envFile } = dotenvConfig();
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
  const config: globalConfigType = {
    disableSinks: env('DISABLE_SINKS') === 'true',
    sourceWhitelist: env('SOURCE_WHITELIST') === '' ? [] : env('SOURCE_WHITELIST').split(','),
    sourceBlacklist: env('SOURCE_BLACKLIST') === '' ? [] : env('SOURCE_BLACKLIST').split(','),
    sinks: {
      sif: {
        userPoolId: env('SIF_USERPOOLID'),
        clientId: env('SIF_CLIENTID'),
        username: env('SIF_USERNAME'),
        password: env('SIF_PASSWORD'),
      },
    },
    sources: {
      ecovacs: {
        email: env('ECOVACS_EMAIL'),
        password: env('ECOVACS_PASSWORD'),
        country: env('ECOVACS_COUNTRY'),
      } as configType,
      nut: {
        nutAddress: env('NUT_ADDRESS'),
        nutPort: env('NUT_PORT'),
        nutAutoReconn: env('NUT_AUTORECONNECT_COOLDOWN'),
      },
      http: {
        serverPort: env('HTTP_PORT'),
      },
    },
  };
  if (missingKeys.length > 0) {
    console.warn('!!! WARNING: the config referenced environment variables that were not found in the .env file:');
    console.warn(`\t- ${missingKeys.join('\t- ')}\n`);
  }
  return config;
};
