const test = require('ava');
const main = require('../lib');

test('main() should return app instance', async t => {
	console.log = () => {};
	const app = await main();
	t.truthy(app);
	t.true(typeof app.listen === 'function');
});
