/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
export type InterpreterReturnType = [string, Record<string, string | number>, Record<string, string | number>]

export type InterpreterType = (...args: any) => void | InterpreterReturnType;

export enum HttpErrorEnum {
  UNSUPPORTED_METHOD = 0,
  NONCOMPLIANT_REQUEST = 1,
  UNKNOWN_FORMAT = 2,
  FORMAT_ERROR = 3,
  UNKNOWN_ERROR = 4,
};

export const errorMessages: Record<HttpErrorEnum, string> = {
  [HttpErrorEnum.UNSUPPORTED_METHOD]: 'the gateway does not support this http method',
  [HttpErrorEnum.NONCOMPLIANT_REQUEST]: 'the gateway only accepts requests with a JSON'
    + 'body containing keys format<string> and data<Record<string, any>>',
  [HttpErrorEnum.UNKNOWN_FORMAT]: 'unknown data format',
  [HttpErrorEnum.FORMAT_ERROR]: 'a formatting error is present in the provided body',
  [HttpErrorEnum.UNKNOWN_ERROR]: 'the gateway failed to process the request',
};

export const errorLogLines: Record<HttpErrorEnum, string> = {
  [HttpErrorEnum.UNSUPPORTED_METHOD]: '[http] unsupported method',
  [HttpErrorEnum.NONCOMPLIANT_REQUEST]: '[http] noncompliant request',
  [HttpErrorEnum.UNKNOWN_FORMAT]: '[http] unknown format',
  [HttpErrorEnum.FORMAT_ERROR]: '[http] format error',
  [HttpErrorEnum.UNKNOWN_ERROR]: '[http] unknown error',
};

export type parsedRequestType = {
  format: string,
  data: object,
};
