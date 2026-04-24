export interface PasswordRule {
	id: string;
	label: string;
	pattern: string;
}

export interface PasswordPolicy {
	regex: string;
	min_length: number;
	rules: PasswordRule[];
}

export interface RuleCheck {
	rule: PasswordRule;
	met: boolean;
}

export interface StrengthResult {
	rules: RuleCheck[];
	allRulesMet: boolean;
	/** 0–100. Gates on allRulesMet for green; entropy bonus continues to fill. */
	score: number;
	/** Discrete tier for coloring: 'weak' | 'fair' | 'good' | 'strong'. */
	tier: 'weak' | 'fair' | 'good' | 'strong';
}

/**
 * Cached RegExp objects per pattern so rule evaluation on every keystroke
 * doesn't recompile.
 */
const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
	if (regexCache.has(pattern)) return regexCache.get(pattern)!;
	try {
		const re = new RegExp(pattern);
		regexCache.set(pattern, re);
		return re;
	} catch {
		regexCache.set(pattern, null);
		return null;
	}
}

function checkRules(password: string, rules: PasswordRule[]): RuleCheck[] {
	return rules.map((rule) => {
		const re = compile(rule.pattern);
		return { rule, met: re ? re.test(password) : false };
	});
}

/**
 * Lightweight entropy estimator. Not zxcvbn — doesn't catch dictionary words
 * or keyboard walks — but calibrated so a policy-passing password lands in
 * the 60–80% band and a long, diverse one pushes to 100%.
 */
function entropyBonus(password: string, minLength: number): number {
	const len = password.length;
	if (len === 0) return 0;

	let pool = 0;
	if (/[a-z]/.test(password)) pool += 26;
	if (/[A-Z]/.test(password)) pool += 26;
	if (/\d/.test(password)) pool += 10;
	if (/[^a-zA-Z0-9]/.test(password)) pool += 32;
	pool = Math.max(pool, 10);

	// bits of entropy, crude
	const bits = Math.log2(pool) * len;

	// Penalties for repeats and sequential runs — cheap approximations.
	const repeatPenalty = /(.)\1{2,}/.test(password) ? 8 : 0;
	const sequencePenalty = /(?:abcd|bcde|cdef|1234|2345|qwer|asdf)/i.test(password) ? 6 : 0;

	// Bonus for exceeding the required minimum length.
	const overshootBonus = Math.max(0, len - Math.max(minLength, 8)) * 1.5;

	return Math.max(0, bits + overshootBonus - repeatPenalty - sequencePenalty);
}

export function evaluatePassword(
	password: string,
	policy: PasswordPolicy | null,
): StrengthResult {
	const rules = policy?.rules ?? [];
	const checks = checkRules(password, rules);
	const allRulesMet = rules.length > 0 && checks.every((c) => c.met);

	if (password.length === 0) {
		return { rules: checks, allRulesMet: false, score: 0, tier: 'weak' };
	}

	const minLen = policy?.min_length ?? 8;
	const bits = entropyBonus(password, minLen);

	// Below the gate: score reflects rule progress (capped) so the bar fills
	// as rules are met but never crosses into green territory.
	if (!allRulesMet) {
		const ruleProgress =
			rules.length === 0 ? 0 : checks.filter((c) => c.met).length / rules.length;
		// Rules contribute up to 40%; entropy contributes up to 15% more,
		// so we can visibly move from 0 to ~55 without meeting all rules.
		const score = Math.min(55, Math.round(ruleProgress * 40 + Math.min(bits, 25) * 0.6));
		const tier = score < 25 ? 'weak' : 'fair';
		return { rules: checks, allRulesMet, score, tier };
	}

	// Gate met: start at 65% ("ok, this will submit") and let entropy push
	// toward 100%. Mapping chosen so ~50 bits → 80 (good), ~70+ bits → 100.
	const above = Math.min(35, (bits - 30) * 0.9);
	const score = Math.max(65, Math.min(100, Math.round(65 + above)));
	const tier = score >= 85 ? 'strong' : 'good';

	return { rules: checks, allRulesMet, score, tier };
}
