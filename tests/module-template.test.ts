import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingModuleTemplate } from '../src/lib/utils/module-template.ts';

test('a module the API reports as missing its template is named', () => {
	const page = { template: 'modular/testimonials', template_missing: true };
	assert.equal(missingModuleTemplate(page, 'modular/testimonials'), 'modular/testimonials');
});

test('the notice shows before the template picker has been filled in', () => {
	const page = { template: 'modular/testimonials', template_missing: true };
	assert.equal(missingModuleTemplate(page, ''), 'modular/testimonials');
});

test('a page whose template exists, or an API that does not say, shows nothing', () => {
	assert.equal(missingModuleTemplate({ template: 'modular/hero', template_missing: false }, 'modular/hero'), null);
	assert.equal(missingModuleTemplate({ template: 'modular/hero' }, 'modular/hero'), null);
	assert.equal(missingModuleTemplate(null, ''), null);
});

test('picking another template in the editor hides the notice until the save', () => {
	const page = { template: 'modular/testimonials', template_missing: true };
	assert.equal(missingModuleTemplate(page, 'modular/hero'), null);
});

test('a flag with no template to name shows nothing', () => {
	assert.equal(missingModuleTemplate({ template_missing: true }, ''), null);
});
