import fs from 'fs';
import { createInterface } from 'readline';
import {
  ConfigType,
  SinkDictionary,
  SinkType,
  SourceDictionary,
  SourceType,
} from './types/globalTypes';
import { getConfig } from './config';

// Load the config for all sources and sinks
const globalConfig = getConfig();
let sinkStorage: SinkDictionary = {};
let sourceStorage: SourceDictionary = {};
const fileFormatRegexp = /^(.*)\.ts$/i;

if (globalConfig.disableSinks) {
  console.info('! ALL SINKS DISABLED !');
}

(async () => {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const lockout = true;
  while (lockout) {
    // eslint-disable-next-line no-await-in-loop, no-loop-func
    await new Promise((resolve) => {
      readline.question('', (input: string) => {
        if (input === '') {
          resolve(true);
          return;
        }
        if (sinkStorage[input]) {
          console.info(`Reloading sink '${input}'`);
          sinkStorage[input].cleanup();
          sinkStorage[input].setup(globalConfig.sinks[input]);
        }
        if (sourceStorage[input]) {
          console.info(`Reloading sink '${input}'`);
          sourceStorage[input].cleanup();
          sourceStorage[input].setup(globalConfig.sources[input], sinkStorage);
        }
        resolve(true);
      });
    });
  }
})();

// Load sinks
let sinkLoadTime = -Date.now();
const sinksPromise: Promise<SinkDictionary> = (async () => {
  const candidateFsObjects = await fs.promises.readdir('./sinks');
  const sinkNames: string[] = (await Promise.all(
    candidateFsObjects.map(async (fsObject : string) => {
      const fsObjectToEvaluate = `./sinks/${fsObject}`;
      const stat = await fs.promises.stat(fsObjectToEvaluate);
      if (stat.isDirectory() || !fileFormatRegexp.test(fsObject)) {
        return null;
      }
      const regexResults: RegExpExecArray | null = fileFormatRegexp.exec(fsObject);
      if (regexResults === null || regexResults.length < 2) {
        return null;
      };
      return regexResults[1];
    }),
  )).filter((sinkName) => sinkName !== null) as string[];
  const sinkConfigs = globalConfig.sinks;
  const readySinks: ([string, SinkType])[] = await Promise.all(
    sinkNames.map(async (sinkName: string): Promise<[string, SinkType]> => {
      const sinkToRead = `./sinks/${sinkName}`;
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const sinkController = require(sinkToRead).default as SinkType;
      if (globalConfig.disableSinks === true) {
        sinkController.drain = async (...args: any[]): Promise<boolean> => {
          console.info('skipped sink for destination \'%s\'', sinkName);
          console.info(args);
          return true;
        };
      }
      const sinkConfig: ConfigType = sinkConfigs[sinkName] || {};
      await sinkController.setup(sinkConfig);
      return [sinkName, sinkController];
    }),
  );
  return readySinks.reduce(
    (accumulator: SinkDictionary, [sinkName, sinkController]: [string, SinkType]) => {
      accumulator[sinkName] = sinkController;
      return accumulator;
    },
    {},
  );
})();

// Load sources
let sourceLoadTime : number;
const sourcesPromise = (async () => {
  sinkStorage = await sinksPromise;
  sourceLoadTime = -Date.now();
  const sourceFiles = await fs.promises.readdir('./sources');
  const sourceNames = (await Promise.all(
    sourceFiles.map(async (sourceFile: string) => {
      const stat = await fs.promises.stat(`./sources/${sourceFile}`);
      if (stat.isDirectory() || !fileFormatRegexp.test(sourceFile)) {
        return null;
      }
      const regexResults: RegExpExecArray | null = fileFormatRegexp.exec(sourceFile);
      if (regexResults === null || regexResults.length < 2) {
        return null;
      };
      const sourceName = regexResults[1];
      if (
        (
          globalConfig.sourceWhitelist.length > 0
          && !globalConfig.sourceWhitelist.includes(sourceName)
        )
        || globalConfig.sourceBlacklist.includes(sourceName)
      ) {
        return null;
      }
      return sourceName;
    }),
  )).filter((sourceName) => sourceName !== null) as string[];

  const sourceConfigs = globalConfig.sources;
  const readySources: ([string, SourceType])[] = await Promise.all(
    sourceNames.map(async (sourceName: string): Promise<[string, SourceType]> => {
      const sourceToRead = `./sources/${sourceName}`;
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const sourceController = require(sourceToRead).default as SourceType;
      const sourceConfig: ConfigType = sourceConfigs[sourceName] || {};
      await sourceController.setup(sourceConfig, sinkStorage);
      return [sourceName, sourceController];
    }),
  );
  return readySources.reduce(
    (accumulator: SourceDictionary, [sourceName, sourceController]: [string, SourceType]) => {
      accumulator[sourceName] = sourceController;
      return accumulator;
    },
    {},
  );
})();

sinksPromise.then((loadedSinks: SinkDictionary) => {
  sinkLoadTime += Date.now();
  const numSinks = Object.keys(loadedSinks).length;
  console.log(
    '> loaded %d sink%s in %ds',
    numSinks,
    numSinks === 1 ? 's' : '',
    (sinkLoadTime / 1000).toFixed(3),
  );
});

sourcesPromise.then(async (loadedSources : SourceDictionary) => {
  sourceStorage = loadedSources;
  sourceLoadTime += Date.now();
  const numSources = Object.keys(loadedSources).length;
  console.log(
    '> loaded %d source%s in %ds',
    numSources,
    numSources === 1 ? '' : 's',
    (sourceLoadTime / 1000).toFixed(3),
  );
});
