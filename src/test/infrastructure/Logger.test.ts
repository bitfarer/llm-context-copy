import * as assert from 'assert';
import { Logger, SilentLogger, LogLevel, ILogger } from '../../infrastructure/Logger';

suite('Logger Test Suite', () => {
  test('SilentLogger should not throw', () => {
    const logger: ILogger = new SilentLogger();
    
    assert.doesNotThrow(() => {
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warning message');
      logger.error('error message');
      logger.setLevel(LogLevel.DEBUG);
    });

    assert.strictEqual(logger.getLevel(), LogLevel.NONE);
  });

  test('Logger should respect log level', () => {
    const logger = new Logger('Test', { level: LogLevel.WARN });
    
    assert.strictEqual(logger.getLevel(), LogLevel.WARN);
    
    logger.setLevel(LogLevel.ERROR);
    assert.strictEqual(logger.getLevel(), LogLevel.ERROR);
  });

  test('LogLevel enum should have correct values', () => {
    assert.strictEqual(LogLevel.DEBUG, 0);
    assert.strictEqual(LogLevel.INFO, 1);
    assert.strictEqual(LogLevel.WARN, 2);
    assert.strictEqual(LogLevel.ERROR, 3);
    assert.strictEqual(LogLevel.NONE, 4);
  });
});
