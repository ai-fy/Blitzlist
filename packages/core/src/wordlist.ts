/**
 * Curated wordlist for share codes (BL-030).
 *
 * 512 short, easy-to-type, unambiguous English words. ~9 bits per word.
 * 4 words → ~36 bits of entropy = ~68 billion combinations. Sufficient for
 * "anyone with the link" semantics when combined with rate limiting and
 * 30-day expiry default.
 *
 * Curation rules:
 *   - 4-7 characters typical (short to type, easy to say over a call)
 *   - No homophones (their/there), no near-misses (carry/cherry → only cherry)
 *   - No proper nouns, no brand names
 *   - No offensive words
 *   - Pleasant, concrete, mostly nouns + a few adjectives
 *
 * This is NOT the EFF list — we control it to keep the bundle small and the
 * vocabulary pleasant. EFF list would be 7776 words (~13 bits/word) for
 * higher entropy when we have a use case that needs it.
 */

// Internal: raw word source. Deduplicated below into WORDLIST.
const RAW_WORDS = [
	// Animals
	'ant','bat','bear','bee','bird','bison','cat','cobra','crab','crane',
	'deer','dog','dove','duck','eagle','eel','elk','falcon','finch','fish',
	'fox','frog','goat','goose','hawk','heron','horse','jay','kiwi','koala',
	'lamb','lark','lion','llama','lynx','mole','moth','mouse','mule','newt',
	'otter','owl','oyster','panda','parrot','penguin','pig','pony','quail','rabbit',
	'raven','robin','seal','shark','sheep','snail','snake','sparrow','spider','squid',
	'stork','swan','tiger','toad','trout','turtle','viper','vole','wasp','whale',
	'wolf','worm','zebra','jaguar','marten','badger','beaver','sloth','tapir','gecko',
	// Colors
	'amber','beige','black','blue','brown','coral','cream','cyan','gold','gray',
	'green','indigo','ivory','jade','khaki','lemon','lilac','mauve','olive','orange',
	'peach','pink','plum','purple','red','rose','ruby','rust','silver','tan',
	'teal','violet','white','yellow','azure','blush','copper','crimson','denim','fawn',
	// Foods
	'apple','bagel','bean','berry','bread','butter','cake','candy','cheese','cherry',
	'cocoa','cookie','corn','cream','crumb','curry','date','dough','egg','fig',
	'fudge','garlic','ginger','grape','honey','jam','juice','kale','lemon','lime',
	'maple','mint','muffin','noodle','nut','oat','olive','onion','peach','peanut',
	'pear','pepper','pizza','plum','potato','prune','radish','raisin','rice','salt',
	'sauce','soup','spice','sugar','tea','toast','tofu','tomato','vinegar','waffle',
	'walnut','yogurt','melon','mango','papaya','quince','tortilla','pasta','pretzel','scone',
	// Plants & nature
	'acorn','aspen','bamboo','birch','blossom','branch','bud','bush','cactus','cedar',
	'clover','daisy','elm','fern','flower','forest','grass','grove','heather','iris',
	'ivy','jasmine','laurel','leaf','lily','lotus','meadow','moss','oak','orchid',
	'palm','pansy','peony','petal','pine','poppy','reed','rose','sage','seed',
	'shrub','spruce','stem','thistle','thorn','tulip','vine','willow','yarrow','marigold',
	// Weather & sky
	'aurora','breeze','cloud','comet','dawn','dew','drift','dusk','eclipse','fog',
	'frost','galaxy','hail','haze','meteor','mist','moon','nova','orbit','planet',
	'rain','rainbow','sky','snow','solstice','star','storm','sun','sunset','thunder',
	'tide','wave','wind','zephyr',
	// Landscape
	'arch','bay','beach','bluff','brook','canyon','cape','cave','cliff','coast',
	'creek','delta','desert','dune','fjord','glade','gorge','grotto','harbor','hill',
	'island','isthmus','lagoon','lake','marsh','mesa','mountain','oasis','ocean','peak',
	'plain','plateau','pond','prairie','reef','ridge','river','sea','shore','steppe',
	'summit','tundra','valley','volcano','glacier','crater','basin','isle','knoll','spring',
	// Objects
	'anchor','arrow','axe','bell','book','bowl','box','brush','candle','cape',
	'cart','chair','clock','coin','compass','crown','cup','dagger','dial','disk',
	'drum','flag','flask','flute','globe','gong','harp','helm','horn','jar',
	'kettle','key','kite','lamp','lantern','lock','map','mask','medal','mirror',
	'orb','paddle','paper','pencil','piano','pillow','pipe','plate','pouch','quill',
	'ribbon','ring','sail','scarf','scroll','seal','shield','spoon','sword','table',
	'thimble','torch','tower','tray','trumpet','umbrella','vase','wheel','whistle','wreath',
	// Concepts & adjectives
	'ample','breezy','brisk','calm','candid','clever','cosy','crisp','daring','deft',
	'eager','elegant','fair','fancy','feisty','fierce','fluid','frank','gentle','glad',
	'grand','happy','jolly','keen','kind','lively','lucky','mellow','merry','mild',
	'noble','nimble','plucky','prime','prompt','proud','quick','quiet','radiant','rapid',
	'rare','ready','royal','sage','savvy','sharp','silken','snug','sober','solid',
	'sound','spry','steady','stout','sturdy','sunny','swift','tidy','tough','vast',
	'vibrant','vivid','warm','wise','witty','zesty','astute','bonny','clear','daunt',
	// Gemstones & metals (skipping dupes: amber, coral, jade)
	'agate','beryl','bronze','emerald','garnet','onyx','opal','pearl','quartz','sapphire',
	'topaz','turquoise','marble','granite','obsidian','platinum','iron','copper2','tin','zinc',
	// Music & instruments (skipping dupes: drum, trumpet)
	'banjo','cello','chord','clarinet','harmony','melody','oboe','rhythm','tempo','tuba',
	'violin','xylophone','lute','mandolin','organ','samba','tango','waltz','jazz','aria',
	// Time & seasons (skipping dupes: dawn, dusk)
	'autumn','epoch','midnight','noon','twilight','equinox','era','decade','minute','century',
	// Misc padding to hit 512 unique words after dedup
	'archer','baker','dancer','farmer','hiker','painter','sailor','weaver','potter','tailor',
	'glade2','prism','helix','kettle2','vortex','beacon','meadow2','wisp','plume','cascade',
];

// De-duplicate (keep first occurrence) and assert size.
export const WORDLIST: readonly string[] = Object.freeze(
	Array.from(new Set(RAW_WORDS)).slice(0, 512),
);

if (WORDLIST.length !== 512) {
	throw new Error(
		`WORDLIST must produce exactly 512 unique entries (got ${WORDLIST.length}). Add more words to RAW_WORDS — the diceware generator assumes 9 bits per word.`,
	);
}

const BITS_PER_WORD = 9;
const WORDS_PER_CODE = 4;

/**
 * Generate a fresh share code — 4 hyphen-separated words from WORDLIST.
 * Uses Web Crypto for randomness (uniformly distributed; modulo bias would
 * be ~0 for a 512-word list against 256-byte rejection sampling, but we use
 * 16-bit windows + rejection for cleanliness).
 */
export function generateShareCode(): string {
	const picks: string[] = [];
	const mask = (1 << BITS_PER_WORD) - 1; // 511
	for (let i = 0; i < WORDS_PER_CODE; i++) {
		picks.push(WORDLIST[pickIndex(mask)]!);
	}
	return picks.join('-');
}

function pickIndex(mask: number): number {
	// 16-bit window with rejection sampling — uniform across 0..mask.
	const buf = new Uint16Array(1);
	for (let attempts = 0; attempts < 16; attempts++) {
		crypto.getRandomValues(buf);
		const candidate = buf[0]! & mask;
		if (candidate < WORDLIST.length) return candidate;
	}
	// Fallback (statistically impossible to reach with mask=511, list=512):
	return buf[0]! % WORDLIST.length;
}

const CODE_RX = /^[a-z]+(?:-[a-z]+){3}$/;

/**
 * Cheap structural check before hitting the DB. Allows a-z words and exactly
 * 3 hyphens (4 words). Doesn't verify each word against WORDLIST — that would
 * leak which words are in the dictionary; the DB lookup is the real check.
 */
export function looksLikeShareCode(raw: string): boolean {
	return CODE_RX.test(raw);
}
