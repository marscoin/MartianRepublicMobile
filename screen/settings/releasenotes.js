import React from 'react';
import { SettingsCard, SettingsCardText, SettingsScreen, settingsNavigation } from '../../components/SettingsUi';
import loc from '../../loc';

const ReleaseNotes = () => {
  const notes = require('../../release-notes');

  return (
    <SettingsScreen overline="MCR / SETTINGS / ABOUT" title={loc.settings.about_release_notes}>
      <SettingsCard>
        <SettingsCardText>{notes}</SettingsCardText>
      </SettingsCard>
    </SettingsScreen>
  );
};

ReleaseNotes.navigationOptions = settingsNavigation(() => loc.settings.about_release_notes);

export default ReleaseNotes;
