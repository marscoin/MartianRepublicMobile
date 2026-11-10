import { useEffect } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';

const SendWithAddress = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  useEffect(() => {
    navigation.replace('SendDetailsRoot', { screen: 'SendDetails', params: { isEditable: true, ...params } });
  }, [navigation, params]);
  return null;
};

SendWithAddress.initialParams = { isEditable: true };
export default SendWithAddress;
