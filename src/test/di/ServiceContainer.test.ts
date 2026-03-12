import * as assert from 'assert';
import { ServiceContainer } from '../../di/ServiceContainer';

suite('ServiceContainer Test Suite', () => {
  let container: ServiceContainer;

  setup(() => {
    container = new ServiceContainer();
  });

  teardown(() => {
    container.clear();
  });

  test('should register and resolve transient service', () => {
    let callCount = 0;
    container.register('test', () => {
      callCount++;
      return { value: callCount };
    });

    const instance1 = container.resolve<{ value: number }>('test');
    const instance2 = container.resolve<{ value: number }>('test');

    assert.strictEqual(instance1.value, 1);
    assert.strictEqual(instance2.value, 2);
    assert.notStrictEqual(instance1, instance2);
  });

  test('should register and resolve singleton service', () => {
    let callCount = 0;
    container.registerSingleton('singleton', () => {
      callCount++;
      return { value: callCount };
    });

    const instance1 = container.resolve<{ value: number }>('singleton');
    const instance2 = container.resolve<{ value: number }>('singleton');

    assert.strictEqual(instance1.value, 1);
    assert.strictEqual(instance2.value, 1);
    assert.strictEqual(instance1, instance2);
  });

  test('should register and resolve scoped service', () => {
    let callCount = 0;
    container.registerScoped('scoped', () => {
      callCount++;
      return { value: callCount };
    });

    const instance1 = container.resolve<{ value: number }>('scoped');
    const instance2 = container.resolve<{ value: number }>('scoped');

    assert.strictEqual(instance1.value, 1);
    assert.strictEqual(instance2.value, 1);
    assert.strictEqual(instance1, instance2);

    // Create new scope
    const newScope = container.createScope();
    const instance3 = newScope.resolve<{ value: number }>('scoped');

    assert.strictEqual(instance3.value, 2);
    assert.notStrictEqual(instance1, instance3);
  });

  test('should throw error for unregistered service', () => {
    assert.throws(() => {
      container.resolve('unregistered');
    }, /Service not registered: unregistered/);
  });

  test('should return undefined for tryResolve unregistered service', () => {
    const result = container.tryResolve('unregistered');
    assert.strictEqual(result, undefined);
  });

  test('should check if service is registered', () => {
    container.register('registered', () => ({}));

    assert.strictEqual(container.isRegistered('registered'), true);
    assert.strictEqual(container.isRegistered('unregistered'), false);
  });

  test('should get all registered tokens', () => {
    container.register('service1', () => ({}));
    container.register('service2', () => ({}));
    container.registerSingleton('service3', () => ({}));

    const tokens = container.getRegisteredTokens();
    assert.strictEqual(tokens.length, 3);
    assert.ok(tokens.includes('service1'));
    assert.ok(tokens.includes('service2'));
    assert.ok(tokens.includes('service3'));
  });

  test('should clear all services', () => {
    container.register('service', () => ({}));
    assert.strictEqual(container.isRegistered('service'), true);

    container.clear();
    assert.strictEqual(container.isRegistered('service'), false);
  });
});
