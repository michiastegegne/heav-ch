import base from './playwright.hive.config.js';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'glass.spec.js',use:{...base.use,browserName:'webkit'}});
