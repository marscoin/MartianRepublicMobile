import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { castVote, joinBallotRound, prepareBallotInput, readBallot } from '../../blue_modules/voting';
import { ballotWindow, fetchProposal, isVotingOpen, tally, timeLeft } from '../../blue_modules/voting/congress';
import { VOTERS_PER_ROUND } from '../../blue_modules/voting/shuffle-session';
import { CivicButton, civicColors } from '../../components/CivicUi';
import { Copyable, Row, Steps } from '../swap/SwapUi';
import { SectionHeading, SmallAction, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';

const STEPS = ['Request a ballot', 'Ballot issued anonymously', 'Cast your vote', 'Vote counted'];
const CHOICES = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'abstain', label: 'Abstain' },
];
const STAGE_TEXT = {
  preparing: 'Preparing your ballot request…',
  gathering: 'Enough voters are here. Waiting a moment for more to join…',
  shuffling: 'Mixing ballots with the other voters…',
  signing: 'Signing the joint ballot transaction…',
  broadcasting: 'Publishing the ballots to the Marscoin network…',
};

export default function Ballot() {
  const { proposalId } = useRoute().params;
  const { wallets } = useContext(BlueStorageContext);
  const wallet = wallets.find(item => item.civic);
  const [data, setData] = useState(null);
  const [ballot, setBallot] = useState(null);
  const [funding, setFunding] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(null); // progress of a round we are in
  const [casting, setCasting] = useState('');
  const [windowNow, setWindowNow] = useState(ballotWindow());
  const joining = useRef(null);
  const voting = useRef(false);

  const refresh = useCallback(async () => {
    if (!wallet) return setLoading(false);
    setError('');
    try {
      const fresh = await fetchProposal(proposalId);
      setData(fresh);
      const state = await readBallot(wallet, fresh.proposal);
      setBallot(state);
      if (state.status === 'none') {
        try {
          await prepareBallotInput(wallet);
          setFunding({ ok: true });
        } catch (problem) {
          setFunding({ ok: false, message: problem.message });
        }
      }
    } catch (failure) {
      setError(failure.message || 'Unable to load your ballot.');
    } finally {
      setLoading(false);
    }
  }, [wallet, proposalId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Confirmations arrive roughly every two minutes.
      const poll = setInterval(() => !joining.current && refresh(), 30000);
      const clock = setInterval(() => setWindowNow(ballotWindow()), 20000);
      return () => {
        clearInterval(poll);
        clearInterval(clock);
      };
    }, [refresh]),
  );

  // Leaving the screen leaves the room. Nothing is spent unless a round completes.
  useEffect(() => () => joining.current?.cancel(), []);

  const proposal = data?.proposal;
  const open = isVotingOpen(proposal);
  const status = ballot?.status;
  const step = status === 'counted' ? 4 : status === 'cast' ? 3 : status === 'ready' ? 2 : status === 'confirming' ? 1 : 0;

  const join = () => {
    if (joining.current) return;
    setRound({ stage: 'preparing' });
    const attempt = joinBallotRound({ wallet, proposal, onProgress: progress => joining.current === attempt && setRound(progress) });
    joining.current = attempt;
    attempt.promise
      .catch(failure => {
        if (failure.message !== 'cancelled') Alert.alert('Ballot not issued', failure.message);
      })
      .finally(() => {
        // An earlier attempt finishing must not disturb a newer one.
        if (joining.current !== attempt) return;
        joining.current = null;
        setRound(null);
        // Whatever happened, show what the chain says now.
        refresh();
      });
  };

  const leave = () => {
    joining.current?.cancel();
    joining.current = null;
    setRound(null);
    refresh();
  };

  const cast = choice =>
    Alert.alert(`Vote ${choice.label}?`, `“${proposal.title}”\n\nA vote is final and cannot be changed.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: `Vote ${choice.label}`,
        onPress: async () => {
          // One vote, even if a second confirmation was queued behind this one.
          if (voting.current) return;
          voting.current = true;
          setCasting(choice.key);
          try {
            await castVote({ wallet, proposal, choice: choice.key });
            await refresh();
          } catch (failure) {
            Alert.alert('Vote not sent', `${failure.message}\n\nYour ballot is unchanged. Try again.`);
          } finally {
            voting.current = false;
            setCasting('');
          }
        },
      },
    ]);

  if (!wallet) {
    return (
      <WorkspaceScreen title="Your ballot" eyebrow="MARTIAN REPUBLIC / CONGRESS">
        <WorkspaceNotice>Restore your civic wallet to vote. Ballots are issued to citizens from their civic identity.</WorkspaceNotice>
      </WorkspaceScreen>
    );
  }

  const count = proposal ? tally(proposal) : null;
  return (
    <WorkspaceScreen title="Your ballot" eyebrow="MARTIAN REPUBLIC / CONGRESS" refreshing={loading} onRefresh={refresh}>
      {error ? (
        <WorkspaceNotice error action="Try again" onPress={refresh}>
          {error}
        </WorkspaceNotice>
      ) : null}
      {proposal ? (
        <View style={styles.card}>
          <Text style={styles.caption}>
            MR-{proposal.id} · {String(proposal.tier || '').toUpperCase()}
          </Text>
          <Text style={styles.cardTitle}>{proposal.title}</Text>
          <Row label="Voting" value={open ? timeLeft(proposal.voting_ends_at) || 'open' : 'closed'} />
          <Row label="So far" value={`${count.yes} yes · ${count.no} no`} />
        </View>
      ) : null}

      {proposal && ballot ? <Steps steps={STEPS} current={step} tone="active" /> : null}

      {proposal && ballot && status === 'none' && !round ? (
        open ? (
          <>
            <Text style={styles.body}>
              Your ballot is issued together with those of the other citizens in your round, in one transaction. Anyone can verify on the
              chain that it came from the voter registry, and the chain does not show which ballot is yours.
            </Text>
            <View style={styles.card}>
              <Row label="Cost" value="0.2 MARS" strong />
              <Text style={styles.caption}>
                Paid to Marscoin miners from your civic wallet: 0.1 to issue the ballot and 0.1 when you vote.
              </Text>
            </View>
            {funding && !funding.ok ? <WorkspaceNotice error>{funding.message}</WorkspaceNotice> : null}
            <View style={styles.card}>
              <Text style={styles.caption}>WHEN TO JOIN</Text>
              <Text style={styles.body}>
                {windowNow.open
                  ? `Voters are gathering now, for another ${windowNow.minutesLeft} min.`
                  : `Voters gather at the top of every hour. Next gathering in ${windowNow.minutesUntil} min.`}
              </Text>
              <Text style={styles.caption}>
                A round needs at least {VOTERS_PER_ROUND} citizens present at once, and the more who share it, the more private every ballot
                is. You can join at any time and wait.
              </Text>
            </View>
            <CivicButton title="Request my ballot" icon="shield" disabled={!funding?.ok} onPress={join} />
          </>
        ) : (
          <WorkspaceNotice>Voting on this proposal is not open.</WorkspaceNotice>
        )
      ) : null}

      {round ? (
        <View style={styles.card}>
          {round.stage === 'waiting' ? (
            <>
              <Text style={styles.cardTitle}>
                {round.present >= VOTERS_PER_ROUND
                  ? `${round.present} voters present`
                  : `${round.present} of at least ${VOTERS_PER_ROUND} voters present`}
              </Text>
              <View style={local.dots}>
                {Array.from({ length: Math.max(VOTERS_PER_ROUND, round.present) }, (_, i) => (
                  <View key={i} style={[local.dot, i < round.present && local.dotOn]} />
                ))}
              </View>
              <Text style={styles.secondaryText}>
                Keep this screen open. The round starts by itself when enough citizens have joined. Nothing is spent while you wait.
              </Text>
              <SmallAction title="Leave the round" icon="x" onPress={leave} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>{STAGE_TEXT[round.stage] || 'Working…'}</Text>
              <Text style={styles.secondaryText}>Keep this screen open for a few more seconds.</Text>
              {round.stage !== 'broadcasting' ? <SmallAction title="Stop and leave" icon="x" onPress={leave} /> : null}
            </>
          )}
        </View>
      ) : null}

      {status === 'confirming' ? (
        <WorkspaceNotice>
          Your ballot has been issued and is waiting for its first confirmation, usually a few minutes. You can leave and come back.
        </WorkspaceNotice>
      ) : null}

      {status === 'ready' ? (
        open ? (
          <>
            <Text style={styles.body}>
              Your anonymous ballot is ready. Your choice is published on the Marscoin chain without your identity.
            </Text>
            {CHOICES.map(choice => (
              <CivicButton
                key={choice.key}
                title={casting === choice.key ? 'Sending…' : choice.label}
                secondary={choice.key !== 'yes'}
                disabled={!!casting}
                onPress={() => cast(choice)}
              />
            ))}
          </>
        ) : (
          <WorkspaceNotice>Voting closed before this ballot was used.</WorkspaceNotice>
        )
      ) : null}

      {status === 'cast' || status === 'counted' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{status === 'counted' ? 'Your vote is on the chain' : 'Your vote has been sent'}</Text>
            <Text style={styles.secondaryText}>
              {status === 'counted'
                ? 'It is included in the public tally once the Republic’s counter reads the block.'
                : 'It is waiting for its first confirmation, usually a few minutes.'}
            </Text>
            <Row label="You voted" value={CHOICES.find(choice => choice.key === ballot.choice)?.label || '—'} />
            <Text style={styles.caption}>Only this phone can show which vote is yours.</Text>
          </View>
          <SectionHeading title="Verify it yourself" />
          <Copyable label="Vote transaction" value={ballot.txid} />
        </>
      ) : null}
    </WorkspaceScreen>
  );
}

const local = {
  dots: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: civicColors.border },
  dotOn: { backgroundColor: civicColors.orange, borderColor: civicColors.orange },
};
