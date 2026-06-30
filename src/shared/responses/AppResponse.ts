import { Response } from 'express';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiSuccessBody<T> = {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

function success<T>(
  res: Response,
  message: string,
  data: T,
  meta?: Record<string, unknown>,
  statusCode = 200,
): Response {
  const body: ApiSuccessBody<T> = {
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  };
  return res.status(statusCode).json(body);
}

export const AppResponse = {
  success,

  created<T>(res: Response, message: string, data: T): Response {
    return success(res, message, data, undefined, 201);
  },

  updated<T>(res: Response, message: string, data: T): Response {
    return success(res, message, data);
  },

  deleted(res: Response, message = 'Deleted successfully'): Response {
    return success(res, message, null);
  },

  paginated<T>(
    res: Response,
    message: string,
    data: T[],
    pagination: PaginationMeta,
  ): Response {
    return success(res, message, data, pagination);
  },
};
