import { marsAlert } from '../../components/MarsDialog';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { getCivicToken } from '../../blue_modules/civic-api';
import { readCitizenshipDraft, saveCitizenshipDraft } from '../../blue_modules/citizenship-draft';
import { endorsementRecipient, prepareEndorsement } from '../../blue_modules/civic-endorsement';
import { publishCitizenshipTransaction } from '../../blue_modules/citizenship-publication';
import NetworkTransactionFees from '../../models/networkTransactionFees';
import { CivicBack, CivicBrand, CivicButton, civicColors, civicStyles } from '../../components/CivicUi';

const MARSConnection = require('../../blue_modules/MARSConnection');

export default function EndorseConfirmationScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const person = params?.person;
  const recipient = endorsementRecipient(person);
  const { wallets } = useContext(BlueStorageContext);
  const wallet = wallets.find(item => item.civic);
  const address = wallet?._getExternalAddressByIndex(0);
  const identity = useRef(address);
  identity.current = address;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [publication, setPublication] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const profile = person?.user?.citizen || person?.citizen;
  const name = person?.user?.fullname || profile?.displayname || 'Fellow Martian';
  // A recipient-specific encrypted draft keeps independent endorsements apart.
  const draftKey = civicAddress => `${civicAddress}.endorsement.${recipient}`;
  const readDraft = civicAddress => readCitizenshipDraft(draftKey(civicAddress));
  const saveDraft = (civicAddress, changes) => saveCitizenshipDraft(draftKey(civicAddress), changes);

  useEffect(() => {
    let active = true;
    setPublication(null);
    if (address && recipient) {
      readCitizenshipDraft(`${address}.endorsement.${recipient}`)
        .then(draft => {
          if (active) setPublication(draft.publication || null);
        })
        .catch(() => {
          if (active) marsAlert('Draft unavailable', 'Your saved endorsement could not be read. Try again before publishing.');
        });
    }
    return () => {
      active = false;
    };
  }, [address, recipient]);

  const run = async submit => {
    if (lock.current || !wallet) return;
    lock.current = true;
    setBusy(true);
    try {
      await MARSConnection.waitTillConnected();
      if (identity.current !== address) throw new Error('Your civic identity changed. Open this endorsement again.');
      if (submit) {
        const submitted = await publishCitizenshipTransaction({
          wallet,
          publication,
          saveDraft,
          findTransaction: MARSConnection.getTxHex,
        });
        if (identity.current === address) {
          setPublication(submitted);
          navigation.navigate('EndorseSuccessScreen', {
            person,
            txid: submitted.txid,
          });
        }
      } else {
        const fees = await NetworkTransactionFees.recommendedFees();
        const prepared = await prepareEndorsement({
          wallet,
          recipient,
          feeRate: Number(fees.mediumFee),
          readDraft,
          saveDraft,
          pin: async (payload, civicAddress) => {
            const token = await getCivicToken();
            if (identity.current !== address) throw new Error('Your civic identity changed. Open this endorsement again.');
            const response = await axios.post(
              'https://martianrepublic.org/api/pinjson',
              {
                type: 'endorsement',
                payload: JSON.stringify(payload),
                address: civicAddress,
              },
              { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 },
            );
            return response.data.Hash;
          },
        });
        if (identity.current === address) setPublication(prepared);
      }
    } catch (error) {
      marsAlert(submit ? 'Submission pending' : 'Endorsement not prepared', error.message || 'Check your connection and try again.');
      if (submit) {
        const draft = await readDraft(address).catch(() => ({}));
        if (identity.current === address && draft.publication) setPublication(draft.publication);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={civicStyles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[civicStyles.content, styles.content]}>
        <CivicBack onPress={() => navigation.goBack()} />
        <CivicBrand subtitle="CITIZENSHIP / ENDORSEMENT" />
        <Text style={civicStyles.title}>Stand behind a fellow Martian.</Text>
        <View style={styles.person}>
          <Image
            source={!imageFailed && profile?.avatar_link ? { uri: profile.avatar_link } : require('../../img/genericprofile.png')}
            onError={() => setImageFailed(true)}
            style={styles.avatar}
          />
          <View style={styles.personText}>
            <Text style={styles.name}>{name}</Text>
            <Text selectable style={styles.address}>
              {recipient || 'Civic address unavailable'}
            </Text>
          </View>
        </View>
        <Text style={civicStyles.body}>
          Endorse someone whose identity you have reviewed. Your civic address and this endorsement will be public.
        </Text>
        {publication && (
          <View style={styles.receipt}>
            <Text style={civicStyles.eyebrow}>NETWORK FEE</Text>
            <Text style={styles.fee}>{new BigNumber(publication.fee).dividedBy(100000000).toFixed(8)} MARS</Text>
            <Text style={civicStyles.body}>
              {publication.status === 'submitted'
                ? 'Submitted. Awaiting blockchain confirmation.'
                : publication.status === 'pending'
                  ? 'The network has not confirmed receipt. Your signed transaction is saved; retry submits the same endorsement.'
                  : 'Saved for review. Confirm below to submit your endorsement.'}
            </Text>
          </View>
        )}
        {publication?.status === 'submitted' ? (
          <CivicButton
            title="View submission"
            onPress={() =>
              navigation.navigate('EndorseSuccessScreen', {
                person,
                txid: publication.txid,
              })
            }
          />
        ) : (
          <CivicButton
            disabled={busy || !wallet || !recipient}
            title={
              busy
                ? 'Please wait…'
                : !publication
                  ? 'Review endorsement fee'
                  : publication.status === 'pending'
                    ? 'Retry submission'
                    : 'Confirm endorsement'
            }
            onPress={() => run(!!publication)}
            icon="check"
          />
        )}
        {!wallet && <Text style={civicStyles.body}>Restore your civic wallet to endorse someone.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 40 },
  person: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    backgroundColor: civicColors.panel,
    padding: 16,
    borderRadius: 16,
  },
  personText: { flex: 1, gap: 8 },
  avatar: { width: 64, height: 64, borderRadius: 12 },
  name: {
    color: civicColors.text,
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 21,
  },
  address: { color: civicColors.muted, fontSize: 12, lineHeight: 18 },
  receipt: {
    backgroundColor: civicColors.panel,
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  fee: {
    color: civicColors.orange,
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 24,
  },
});
