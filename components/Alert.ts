import { marsAlert } from './MarsDialog';
import loc from '../loc';
const presentAlert = ({ title, message }: { title?: string; message: string }) => {
  marsAlert(title ?? loc.alert.default, message);
};
export default presentAlert;
