import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 测试全部使用内存数据库，互不干扰，也不会碰到真实数据文件
    env: { DB_FILE: ':memory:' },
  },
});