const tap = require('tap');
const main = require('../lib');
// const td = require('testdouble');

tap.test('main()', async t => {
	const app = await main();
	t.ok(app);
	t.end();
});
