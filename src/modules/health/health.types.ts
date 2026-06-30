export type DependencyStatus = 'up' | 'down' | 'not_configured';

export type HealthCheckDto = {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  version: string;
};

export type ReadinessCheckDto = {
  service: string;
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    queues: DependencyStatus;
  };
};
