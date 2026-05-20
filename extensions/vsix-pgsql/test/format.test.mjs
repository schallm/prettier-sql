import { registerFormatTests } from '../../shared/format.test.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
registerFormatTests(join(__dirname, '..', 'bundled', 'format.mjs'));
