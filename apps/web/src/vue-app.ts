import { createPinia } from 'pinia';
import type { App } from 'vue';

/**
 * Vue island 的统一入口。
 * Astro 会把每个 island 的 app 实例交给这里做全局配置。
 */
export default (app: App) => {
  app.use(createPinia());
};
