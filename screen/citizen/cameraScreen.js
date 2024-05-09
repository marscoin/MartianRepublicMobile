import { defaultMaxListeners } from 'events';
import React, { useState } from 'react';
import { Modal, View, Button } from 'react-native';
import { CameraScreen } from 'react-native-camera-kit';
import { Icon } from 'react-native-elements';

const MyCameraScreen = ({ navigation }) => {
    const onCapture = (capture) => {
      console.log(capture);
      // you can handle navigation or state updates here with the captured image data
    };
  
    return (
      <CameraScreen
        actions={{ rightButtonText: 'Done', leftButtonText: 'Cancel' }}
        onBottomButtonPressed={(event) => {
          if (event.type === 'right') {
            onCapture(event.capture);
          } else {
            navigation.goBack();
          }
        }}
        // flashImages={{
        //   on: require('path/to/flashOnIcon.png'),
        //   off: require('path/to/flashOffIcon.png'),
        //   auto: require('path/to/flashAutoIcon.png'),
        // }}
        cameraFlipImage ={require('../../img/flipCameraImg1.png')}
       
        captureButtonImage={require('../../img/capture.png')}
        // torchOnImage={require('path/to/torchOnIcon.png')}
        // torchOffImage={require('path/to/torchOffIcon.png')}
        saveToCameraRoll={true}
        showCapturedImageCount={true}
      />
    );
  };
  

export default MyCameraScreen;