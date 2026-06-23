import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors/AppError';

type RequestPart = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodSchema<T>, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.flatten();
      next(new ValidationError('Request validation failed', details as Record<string, unknown>));
      return;
    }

    (req as Request & { validated: Record<string, unknown> }).validated ??= {};
    (req as Request & { validated: Record<string, unknown> }).validated[part] = result.data;
    next();
  };
}

export function getValidated<T>(req: Request, part: RequestPart): T {
  const validated = (req as Request & { validated?: Record<string, unknown> }).validated;
  return validated?.[part] as T;
}
