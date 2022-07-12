// Allows data to be submitted to the SIF
// time-series data storage platform.
import {
  connect as mqttConnect, MqttClient,
} from 'mqtt';
import {
  CognitoUser,
  CognitoUserPool,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import {
  configType,
} from '../types/globalTypes';

interface sifDataType {
  app_name: string,
  token: string,
  data: {
    time: number,
    device?: string | null,
    metadata: Record<string, string | number>,
    payload: Record<string, string | number>,
  },
};

let config: configType;
let idToken: string;
let refreshInterval: ReturnType<typeof setTimeout>;
let cognitoUser: CognitoUser;
let broker: MqttClient;

const refreshToken = async () : Promise<string> => {
  const tokenFinished: Promise<string> = new Promise<string>((resolve) => {
    if (cognitoUser === null) {
      return;
    }
    cognitoUser.authenticateUser(
      new AuthenticationDetails({
        Username: config.username as string,
        Password: config.password as string,
      }),
      {
        onSuccess: (result) : void => {
          const token = result.getIdToken().getJwtToken();
          console.info('refreshed sif token');
          idToken = token;
          resolve(token);
        },
        onFailure: (error) : void => {
          console.error(error);
          resolve('');
        },
      },
    );
  });
  return tokenFinished;
};

const drain = async (
  appName: string,
  metrics: Record<string, string | number>,
  metadata = {},
  timestamp = Date.now() / 1000,
  deviceId = null,
) : Promise<boolean> => {
  if (appName === undefined || appName === null) {
    console.error('sink "sif" requires non-null app name');
    return false;
  }

  if (metrics === undefined || metrics === null) {
    console.error('sink "sif" requires non-null metrics');
    return false;
  }

  const blob: sifDataType = {
    app_name: appName,
    token: idToken,
    data: {
      time: timestamp,
      device: deviceId,
      metadata,
      payload: metrics,
    },
  };

  broker.publish(
    'data/ingest/passthrough',
    JSON.stringify(blob),
  );
  return true;
};

export default {
  drain,
  setup: async (configIn: configType) : Promise<{
    success: boolean,
    message?: string,
  }> => {
    config = configIn;
    try {
      cognitoUser = new CognitoUser({
        Username: config.username as string,
        Pool: new CognitoUserPool({
          UserPoolId: config.userPoolId as string,
          ClientId: config.clientId as string,
        }),
      });
      broker = mqttConnect('mqtt://broker.uvasif.org');
      // Refresh the token every 58 minutes (tokens valid for 1hr)
      if ((await refreshToken()) !== '') {
        return {
          success: false,
          message: 'failed to get id token',
        };
      }
      refreshInterval = setInterval(refreshToken, 3480000);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as string).toString(),
      };
    }
  },
  cleanup: async () : Promise<boolean> => {
    clearInterval(refreshInterval);
    return true;
  },
};
