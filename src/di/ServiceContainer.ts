import * as vscode from 'vscode';

export type ServiceLifetime = 'singleton' | 'transient' | 'scoped';

export interface ServiceRegistration<T> {
  factory: () => T;
  lifetime: ServiceLifetime;
  instance?: T;
}

export class ServiceContainer {
  private services = new Map<string, ServiceRegistration<any>>();
  private scopedInstances = new Map<string, any>();

  /**
   * 注册瞬态服务（每次解析创建新实例）
   */
  register<T>(token: string, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: 'transient',
    });
  }

  /**
   * 注册单例服务（全局唯一实例）
   */
  registerSingleton<T>(token: string, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: 'singleton',
    });
  }

  /**
   * 注册作用域服务（每个作用域内唯一）
   */
  registerScoped<T>(token: string, factory: () => T): void {
    this.services.set(token, {
      factory,
      lifetime: 'scoped',
    });
  }

  /**
   * 解析服务
   */
  resolve<T>(token: string): T {
    const registration = this.services.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${token}`);
    }

    switch (registration.lifetime) {
      case 'singleton':
        if (!registration.instance) {
          registration.instance = registration.factory();
        }
        return registration.instance;

      case 'scoped':
        if (!this.scopedInstances.has(token)) {
          this.scopedInstances.set(token, registration.factory());
        }
        return this.scopedInstances.get(token);

      case 'transient':
      default:
        return registration.factory();
    }
  }

  /**
   * 尝试解析服务（不存在返回 undefined）
   */
  tryResolve<T>(token: string): T | undefined {
    try {
      return this.resolve(token);
    } catch {
      return undefined;
    }
  }

  /**
   * 检查服务是否已注册
   */
  isRegistered(token: string): boolean {
    return this.services.has(token);
  }

  /**
   * 创建新的作用域
   */
  createScope(): ServiceContainer {
    const scope = new ServiceContainer();
    for (const [token, registration] of this.services) {
      if (registration.lifetime === 'scoped') {
        scope.registerScoped(token, registration.factory);
      } else {
        scope.services.set(token, registration);
      }
    }
    return scope;
  }

  /**
   * 清除所有服务
   */
  clear(): void {
    this.services.clear();
    this.scopedInstances.clear();
  }

  /**
   * 获取所有已注册的服务标识
   */
  getRegisteredTokens(): string[] {
    return Array.from(this.services.keys());
  }
}

/**
 * 全局服务容器实例
 */
export const globalContainer = new ServiceContainer();

/**
 * 服务装饰器 - 用于自动注入
 */
export function Injectable(token: string) {
  return function (target: any, propertyKey: string) {
    Object.defineProperty(target, propertyKey, {
      get: () => globalContainer.resolve(token),
      enumerable: true,
      configurable: true,
    });
  };
}
