import {
  InfluxDB,
  Point,
  QueryApi,
  WriteApi,
} from '@influxdata/influxdb-client';
import { ConfigType, SetupMessage, SinkType } from '../types/globalTypes';
import { SifMetadataType, SifMetricsType } from '../types/sinkSifTypes';

let influx: WriteApi;
let influxQ: QueryApi;

const drain = async (
  appName: string,
  metrics: SifMetricsType,
  metadata: SifMetadataType = {},
  timestamp = Date.now(),
  // eslint-disable-next-line no-unused-vars
  _deviceId = null,
) : Promise<boolean> => {
  const point = new Point(appName).timestamp(new Date(timestamp));
  Object.entries(metrics).forEach(([metric, value]) => {
    // Add field
    if (typeof value === 'string') {
      point.stringField(metric, value);
    } else {
      point.floatField(metric, value);
    }

    // Add tags
    Object.entries(metadata).forEach(([key, val]) => {
      if (typeof val === 'string') {
        point.tag(key, val);
      }
    });

    return point;
  });

  // Write to influx
  try {
    influx.writePoint(point);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const getInfluxQueryApi = () => influxQ;

export default {
  drain,
  setup: async (configIn: ConfigType) : Promise<SetupMessage> => {
    try {
      const inf = new InfluxDB({
        url: configIn.url.toString(),
        token: configIn.token.toString(),
      });

      influx = inf.getWriteApi(
        configIn.org.toString(),
        configIn.bucket.toString(),
        'ms',
      );

      influxQ = inf.getQueryApi(configIn.org.toString());

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: (error as string).toString(),
      };
    }
  },
  cleanup: () => Promise.resolve(true),
} as SinkType;
