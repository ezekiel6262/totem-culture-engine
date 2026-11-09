import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function deploymentApi() {
  const window = {};
  vm.runInNewContext(fs.readFileSync('dist/totem-deploy.js', 'utf8'), { window, fetch, Uint8Array });
  return window.totemDeploy;
}

test('token allocation plan preserves exact supply and creator cliff', () => {
  const api = deploymentApi();
  const before = Date.now();
  const allocations = api.tokenAllocations({
    supply: '1,000',
    decimals: 2,
    split: [40, 25, 20, 15],
    destinations: ['community.testnet', 'liquidity.testnet', 'treasury.testnet', 'creator.testnet'],
    vesting: '12 months',
  });

  assert.deepEqual(Array.from(allocations, item => item.amount), ['40000', '25000', '20000', '15000']);
  assert.equal(allocations.slice(0, 3).every(item => item.unlock_at_ms === null), true);
  assert.equal(allocations[3].unlock_at_ms >= before + 12 * 30 * 86400000, true);
  assert.equal(allocations.reduce((sum, item) => sum + BigInt(item.amount), 0n), 100000n);
});

test('token allocation plan rejects ambiguous custody', () => {
  const api = deploymentApi();
  const token = {
    supply: '1000',
    decimals: 0,
    split: [40, 25, 20, 15],
    destinations: ['same.testnet', 'same.testnet', 'treasury.testnet', 'creator.testnet'],
  };

  assert.throws(() => api.tokenAllocations(token), /unique custody account/);
});

test('NFT launch config converts price and royalties into enforceable init args', () => {
  const api = deploymentApi();
  const config = api.nftLaunchConfig({
    supply: '10,000',
    price: '2.5 NEAR',
    royalty: '5%',
    royaltyRecipient: '@creator',
    treasuryRoyalty: '2.5%',
    treasuryRecipient: 'treasury.testnet',
  }, 'creator.testnet');

  assert.deepEqual({ ...config }, {
    max_supply: 10000,
    mint_price: '2500000000000000000000000',
    primary_sale_receiver_id: 'treasury.testnet',
    creator_royalty_bps: 500,
    creator_royalty_receiver_id: 'creator.testnet',
    treasury_royalty_bps: 250,
    treasury_royalty_receiver_id: 'treasury.testnet',
  });
});

test('all Forge and Arena component scripts parse as JavaScript', () => {
  for (const file of ['dist/Token-First.dc.html', 'dist/NFT-First.dc.html', 'dist/Twin-Launch.dc.html', 'dist/Forge-DNA.dc.html', 'dist/Launch-Review.dc.html', 'dist/Access.dc.html', 'dist/Arena.dc.html', 'dist/Market.dc.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = [...html.matchAll(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length, `${file} includes a component script`);
    for (const [, source] of scripts) new vm.Script(source, { filename: file });
  }
});
