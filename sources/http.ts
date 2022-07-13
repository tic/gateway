import {
  createServer,
  Server,
} from 'http';
import {
  configType,
  setupMessage,
  sinkDictionary,
  sourceType,
} from '../types/globalTypes';
import {
  InterpreterType,
  InterpreterReturnType,
  HttpErrorEnum,
  errorMessages,
  errorLogLines,
  parsedRequestType,
} from '../types/sourceHttpTypes';

let server: Server;
let sinks: sinkDictionary;

const interpreters: Record<string, InterpreterType> = {
  sif: ((data: {
    app_name?: unknown,
    metrics?: unknown,
    metadata?: unknown,
  }) : InterpreterReturnType => {
    if (
      data.app_name === undefined
      || typeof data.app_name !== 'string'
      || data.metrics === undefined
      || typeof data.metrics !== 'object'
      || data.metadata === undefined
      || typeof data.metadata !== 'object'
    ) {
      // eslint-disable-next-line no-use-before-define
      throw new HttpInputError(HttpErrorEnum.FORMAT_ERROR);
    };
    return [
      data.app_name,
      data.metrics,
      data.metadata,
    ] as InterpreterReturnType;
  }) as InterpreterType,
};

class HttpInputError extends Error {
  constructor(errType: HttpErrorEnum) {
    super(errorMessages[errType]);
    console.log(errorLogLines[errType]);
  }
}

async function requestHandler(request: any, response: any) {
  try {
    if (request.method === 'POST') {
      const requestResult: parsedRequestType = await new Promise((resolve) => {
        request.on('data', (postData: any) => {
          let parsedBody : {
            format: string,
            data: Record<string, any>,
          } = {
            format: '',
            data: {},
          };
          try {
            parsedBody = JSON.parse(postData.toString());
          } finally {
            resolve(parsedBody);
          }
        });
      });
      const {
        format,
        data,
      } = requestResult;
      if (format === '' || Object.keys(data).length === 0) {
        throw new HttpInputError(HttpErrorEnum.NONCOMPLIANT_REQUEST);
      }
      const interpreter: InterpreterType = interpreters[format];
      if (interpreter === undefined) {
        throw new HttpInputError(HttpErrorEnum.UNKNOWN_FORMAT);
      }
      const processed: void | InterpreterReturnType = interpreter(data);
      if (processed !== undefined) {
        sinks.sif.drain(...processed);
      }
      return;
    }
    throw new HttpInputError(HttpErrorEnum.UNSUPPORTED_METHOD);
  } catch (error) {
    if (error instanceof HttpInputError) {
      response.write(JSON.stringify({
        message: error.message,
      }));
    } else {
      console.error(error);
    }
  } finally {
    response.end();
  }
}

const setup = async (configIn: configType, sinksIn: sinkDictionary) : Promise<setupMessage> => {
  sinks = sinksIn;
  server = createServer(requestHandler);
  server.listen(configIn.serverPort);
  return {
    success: true,
  };
};

const cleanup = async () => {
  server.close();
  return true;
};

export default {
  setup,
  cleanup,
} as sourceType;
