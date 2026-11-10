# App Store review notes for the voting and swaps update

Draft, 2026-11-09. For the first App Store submission that includes anonymous voting and Bitcoin to Marscoin swaps (TestFlight 1.0.8). Nothing here has been submitted.

The first section is text to paste into App Store Connect's "Notes" field. The rest is for whoever prepares the submission.

## Notes for the reviewer (paste into App Store Connect)

Martian Republic is a non-custodial wallet for Marscoin and the companion app of the Martian Republic, a community governance project. This update adds two features.

**1. Peer-to-peer swaps (Wallet tab > "Get Marscoin with Bitcoin")**

- A person can exchange their own Bitcoin for another person's Marscoin directly, using an atomic swap: each side locks their coins on its own blockchain and the two are released together. This is an open protocol, also implemented in the Electrum-Mars desktop wallet.
- The app is not an exchange and does not operate one. We are not a party to any trade, we never hold or control anyone's funds, we set no prices, and we charge no fee. The only costs are the blockchains' own network fees.
- Offers come from other users, published on a public relay. The app verifies the other side's coins on the Marscoin blockchain before letting the user pay.
- To make this possible the app now includes a Bitcoin wallet. Like the Marscoin wallet, it is non-custodial: keys are generated and kept on the device, secured by the user's own recovery phrase.
- There is no fiat currency, no purchase of digital goods or services from us, and no account with us.

**2. Voting (Home > "Congress and voting")**

- Registered citizens of the Martian Republic can vote Yes, No or Abstain on community proposals. Votes are recorded on the Marscoin blockchain.
- Ballots are issued to several citizens together in one transaction, so anyone can verify that a ballot belongs to a registered citizen without the blockchain showing which citizen cast it.
- Voting costs only the blockchain's network fee (0.2 MARS, a few cents). Nothing is paid to us.

**How to see it**

A test wallet is provided below. After restoring it:

1. Open the Wallet tab and tap "Get Marscoin with Bitcoin". Live offers and the Bitcoin wallet are shown. Tapping "Swap" explains the terms before anything is committed. (Completing a swap takes one to two hours because it waits for Bitcoin confirmations, so we suggest stopping at this screen.)
2. Open Home > "Congress and voting" and open a proposal. A proposal in its voting phase shows "Vote on this proposal", which opens the ballot screen and explains the cost before anything is committed. (Issuing a ballot needs three citizens present at the same time, so we suggest stopping at this screen.)

Test wallet recovery phrase: `<fill in at submission; do not commit>`

Contact during review: `<name, email, phone>`

## Before submitting

- [ ] Complete one real swap and one real vote on the TestFlight build, so the notes describe something that has been seen to work.
- [ ] Create a dedicated review wallet. Fund it with a little Marscoin and a few thousand sats, register it as a citizen if the voting screen is to be shown in full, and put its recovery phrase only in App Store Connect.
- [ ] Make sure a proposal is in its voting phase during the review window. MR-17 ("Test proposal: try the mobile ballot") is open from 2026-11-13 to 2026-11-20 UTC; publish another if review falls outside that.
- [ ] Update the screenshots and the description to mention swaps and voting. Describe swaps as "peer-to-peer" and "non-custodial"; avoid "exchange", "buy" and "trade".
- [ ] Check the export compliance answers. The app now also uses RSA and AES for the ballot round, in addition to the signing it already did. This is standard cryptography used for authentication and privacy of the user's own data.
- [ ] Confirm the privacy details: no account, no tracking, no data collected by us for swaps or votes. The swap relay and the ballot server see the device's network address, as any server does.

## If the swap feature is questioned

Apple's guidelines allow wallets from organizations, and allow apps to facilitate exchange when offered by an approved exchange or licensed institution. The position to hold is that this app does neither: it is a wallet that lets two users transact with each other using a public protocol, with no intermediary.

Points to make, in this order:

1. No custody: at no time do we or any server hold user funds. A swap either completes on both chains or each side's coins return to their owner after a time lock.
2. No intermediation: we are not a counterparty, we do not match or price orders, and we take no fee or spread.
3. Precedent: non-custodial wallets with built-in peer-to-peer or decentralized swaps are on the App Store.

If review still will not accept it, the rest of the update stands alone. A build with the swap entry points hidden can be submitted while the question is discussed; the swap code can stay in place behind a remote switch or a build flag. That switch does not exist yet and would need to be added first.
