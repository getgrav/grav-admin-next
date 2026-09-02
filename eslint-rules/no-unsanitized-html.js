/**
 * Require every `{@html …}` sink to name a sanitizer.
 *
 * `{@html}` is the only way to render markup a package or an editor supplied,
 * and admin renders plenty of it on purpose — blueprint help text, package
 * descriptions, changelog bodies. The danger is not the tag, it is a tag whose
 * expression nobody cleaned: two rounds of security reports have now come from
 * sinks that were written before `sanitizeHtml()` existed and never wired to it.
 *
 * So this rule does not ban `{@html}`. It requires the expression to bottom out
 * in one of the helpers in `src/lib/utils/markdown.ts`, in `i18n.tHtml()` (whose
 * template is developer-authored and whose values are escaped on the way in), or
 * in a string literal. Conditionals, `||` fallbacks and parentheses are followed
 * through, so `{@html x ? renderMarkdown(x) : ''}` passes.
 *
 * A sink that genuinely renders developer-authored markup — an icon a component
 * ships with itself, say — takes an eslint-disable-next-line comment that says
 * where the markup comes from. Making that the only exit is the point: it turns
 * "is this safe?" into a question someone had to answer in writing.
 */

const SANITIZERS = new Set([
	// src/lib/utils/markdown.ts
	'sanitizeHtml',
	'renderMarkdown',
	'renderMarkdownInline',
	// src/lib/utils/markdown.ts — sanitizes first, then marks matches in the text between tags
	'highlightMatchInHtml',
	'highlightMatch',
	'escapeHtml',
	// src/lib/dashboard/format.ts — a thin wrapper over renderMarkdownInline()
	'renderInlineMarkdown',
	// i18n: developer-authored template, values escaped by escapeMarkdownParam()
	'tHtml'
]);

/** @param {import('estree').Node | null | undefined} node */
function calleeName(node) {
	if (!node) return null;
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'MemberExpression' && !node.computed) return calleeName(node.property);

	return null;
}

/**
 * The body of a local one-line wrapper, if `name` resolves to one in this file.
 *
 * Components routinely wrap a helper — `highlight(text)` calling
 * `highlightMatch(text, filter)` — and refusing to look through that would force
 * either an inlined call at every sink or a disable comment, both of which make
 * the rule noisier than the thing it guards.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {any} node the identifier being called
 * @returns {any[]} expressions the wrapper can evaluate to
 */
function localWrapperReturns(context, node) {
	const ref = context.sourceCode
		.getScope(node)
		.references.find((r) => r.identifier === node);
	const def = ref?.resolved?.defs?.[0];
	if (!def) return [];

	const fn =
		def.node?.type === 'FunctionDeclaration'
			? def.node
			: def.node?.type === 'VariableDeclarator' &&
				  (def.node.init?.type === 'ArrowFunctionExpression' ||
						def.node.init?.type === 'FunctionExpression')
				? def.node.init
				: null;
	if (!fn) return [];

	// Concise arrow body: `const f = (x) => g(x)`.
	if (fn.body && fn.body.type !== 'BlockStatement') return [fn.body];

	return (fn.body?.body ?? [])
		.filter((/** @type {any} */ st) => st.type === 'ReturnStatement' && st.argument)
		.map((/** @type {any} */ st) => st.argument);
}

/**
 * Does this expression bottom out in a sanitizer on every branch?
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('estree').Node | null | undefined} node
 * @param {number} [depth]
 * @returns {boolean}
 */
function isSanitized(context, node, depth = 0) {
	if (!node) return false;

	switch (node.type) {
		case 'CallExpression': {
			if (SANITIZERS.has(calleeName(node.callee) ?? '')) return true;
			if (depth > 0 || node.callee.type !== 'Identifier') return false;

			const returns = localWrapperReturns(context, node.callee);

			return returns.length > 0 && returns.every((r) => isSanitized(context, r, depth + 1));
		}
		case 'ConditionalExpression':
			return (
				isSanitized(context, node.consequent, depth) &&
				isSanitized(context, node.alternate, depth)
			);
		case 'LogicalExpression':
			return isSanitized(context, node.left, depth) && isSanitized(context, node.right, depth);
		case 'TSAsExpression':
		case 'TSNonNullExpression':
			return isSanitized(context, node.expression, depth);
		case 'Literal':
			// `{@html cond ? renderMarkdown(x) : ''}` — a literal branch is inert.
			return typeof node.value === 'string';
		case 'TemplateLiteral':
			return node.expressions.length === 0;
		default:
			return false;
	}
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
	meta: {
		type: 'problem',
		docs: {
			description:
				'require the expression in an {@html …} tag to be produced by a sanitizing helper'
		},
		schema: [],
		messages: {
			unsanitized:
				'{@html} must render the result of a sanitizing helper ({{helpers}}). Wrap the value, or add an eslint-disable-next-line for this rule saying where the markup comes from.'
		}
	},

	create(context) {
		return {
			/** @param {any} node */
			'SvelteMustacheTag[kind="raw"]'(node) {
				if (isSanitized(context, node.expression)) return;

				context.report({
					node,
					messageId: 'unsanitized',
					data: { helpers: [...SANITIZERS].join(', ') }
				});
			}
		};
	}
};
