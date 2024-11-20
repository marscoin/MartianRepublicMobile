import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, KeyboardAvoidingView, Dimensions, Modal, StyleSheet, View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const ForumThreadScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const route = useRoute();
    const maxContentLength = 25000;
    const threadTitle = route.params.thread.title;
    const threadId = route.params.thread.id;
    const [threadData, setThreadData] = useState('');
    const [replyToPostId, setReplyToPostId] = useState(null);
    const [isModalVisible, setModalVisible] = useState(false);
    const [isReportModalVisible, setReportModalVisible] = useState(false);
    const [isReportUserModalVisible, setReportUserModalVisible] = useState(false);
    const [newCommentContent, setNewCommentContent] = useState('');
    const [userIdToBlock, setUserIdToBlock] = useState(null);
    const [userNameToBlock, setUserNameToBlock] = useState('');
    const [remainingChars, setRemainingChars] = useState(maxContentLength);

    const closeModal = () => {
        setModalVisible(false);
        setNewCommentContent('');
        setRemainingChars(maxContentLength); // Reset character count
        setReplyToPostId(null);
    };

    const transformThreadData = (data) => {
        let messages = [];
        let messageMap = {};
        data.forEach(item => {
            // Only process unblocked comments
            if (item.is_blocked === 0) {
                const comment = { ...item, comments: [] };
                if (comment.pid === null) {
                    messages.push(comment);
                    messageMap[comment.id] = comment;
                } else {
                    if (messageMap[comment.pid]) {
                        // Filter nested comments as well
                        if (item.is_blocked === 0) {
                            messageMap[comment.pid].comments.push(comment);
                        }
                    }
                }
            }
        });
        return messages;
    };

    useEffect(() => {
        fetchThreadData();
    }, [threadId]);

    async function fetchThreadData() {
        try {
            const token = await AsyncStorage.getItem('@auth_token');
            const response = await axios.get(`https://martianrepublic.org/api/forum/thread/${threadId}/comments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const comments = response?.data?.comments?.original?.comments;
            if (!comments) {
                console.error("Comments data is undefined or not in the expected format.");
                return;
            }

            // Filter out blocked comments from the main and nested comments
            const filteredComments = comments
                .filter(comment => comment.is_blocked === 0)
                .map(comment => ({
                    ...comment,
                    comments: comment.comments ? comment.comments.filter(nestedComment => nestedComment.is_blocked === 0) : [],
                }));

            const formattedData = transformThreadData(response.data.comments.original.comments);
            setThreadData(formattedData);
            console.log('THREAD INDIVIDUAL DATA', response.data.comments.original.comments)
        } catch (error) {
            console.error('Error fetching thread data:', error);
        }
    }

    async function blockUser(userId) {
        try {
            const token = await AsyncStorage.getItem('@auth_token');
            console.log('token', token);
            const response = await axios.get(`https://martianrepublic.org/api/user/block/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('BLOCK USER RESPONSE', response.data);
            // // Optionally refresh thread data to remove blocked user’s comments
            // fetchThreadData();
            setReportUserModalVisible(false); // Hide modal after blocking
            Alert.alert("User Blocked", "User has been blocked.");
            fetchThreadData();
        } catch (error) {
            console.error('Error blocking user:', error);
        }
    }
      
    const isFormValid = newCommentContent !== '';

    async function createNewComment() {
        const token = await AsyncStorage.getItem('@auth_token');
        await axios.post(`https://martianrepublic.org/api/forum/thread/${threadId}/comment`, 
            { 
                "content": newCommentContent,
                "post_id": replyToPostId 
            },
            { headers: {'Authorization': `Bearer ${token}`}}
        );
        // setModalVisible(false);
        // setNewCommentContent('');
        // setReplyToPostId(null);
        closeModal();
        fetchThreadData(); 
    }

    const onReportSubmit = () => {
        setReportModalVisible(false);
        setReportUserModalVisible(false);
        setNewCommentContent('');
        Alert.alert("Report Sent", "Your report has been sent successfully.");
    };

    const handleContentChange = (content) => {
        setNewCommentContent(content);
        setRemainingChars(maxContentLength - content.length);
    };

    const Comment = ({ comment }) => (
        <View style={styles.commentBlock}>
            <View style={{flexDirection:'row'}}>
                <Text style={styles.threadAuthor}>{comment.fullname}   </Text>
                <TouchableOpacity 
                    onPress={() => {
                        //console.log('ITEM',item);
                        setUserIdToBlock(comment.author_id); 
                        setUserNameToBlock(comment.fullname);
                        setReportUserModalVisible(true);
                    }}
                >
                        <Icon name="cancel" size={18} type="material-community" color={'#FF7400'} />
                </TouchableOpacity>
            </View>
            <Text style={styles.threadDate}>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</Text>
            <Text style={styles.threadReplies}>{comment.content}</Text>
            <View style={{ alignSelf: 'flex-end', marginVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                {/* <TouchableOpacity
                    hitSlop={20}
                    onPress={() => {
                        setReplyToPostId(comment.id);
                        setModalVisible(true);
                    }}
                >
                    <Icon name="reply" size={28} type="material-community" color={'#FF7400'} />
                </TouchableOpacity> */}
                <TouchableOpacity  
                    style={{ marginHorizontal: 20 }}
                    onPress={() => setReportModalVisible(true)}
                >
                   <Icon name="flag" size={20} type="material-community" color={'#FF7400'} />
                </TouchableOpacity>
            </View>
            {comment.comments.map(nestedComment => (
                <Comment key={nestedComment.id} comment={nestedComment} />
            ))}
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, marginBottom: -30 }}>
            <TouchableOpacity
                style={styles.header}
                onPress={() => navigation.goBack()}
            >
                <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={styles.headerTxt}>COMMENTARY</Text>
                </View>
            </TouchableOpacity>

            <View style={{ marginTop: 5, alignItems: 'center' }}>
                <Text style={styles.headerTxt}>{threadTitle}</Text>
                <LinearGradient colors={['#FFB67D', '#FF8A3E', '#FF7400']} style={styles.orangeButtonGradient}>
                    <TouchableOpacity
                        style={[styles.orangeButton]}
                        onPress={() => {
                            setReplyToPostId(null);
                            setModalVisible(true);
                        }}
                    >
                        <Text style={styles.buttonText}>New comment</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </View>

            <FlatList
                data={threadData}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.threadBlock}>
                        <View style={{flexDirection:'row'}}>
                            <Text style={styles.threadAuthor}>{item.fullname}   </Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    //console.log('ITEM',item);
                                    setUserIdToBlock(item.author_id); 
                                    setUserNameToBlock(item.fullname);
                                    setReportUserModalVisible(true);
                                }}
                            >
                                <Icon name="cancel" size={18} type="material-community" color={'#FF7400'} />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.threadDate}>
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </Text>
                        <Text style={styles.threadTxt}>{item.content}</Text>
                        {/* /////////BUTTON AREA//////// */}
                        <View style={{ alignSelf: 'flex-end', marginVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                            <TouchableOpacity
                                // style={{ alignSelf: 'flex-end',  }}
                                hitSlop={20}
                                onPress={() => {
                                    setReplyToPostId(item.id);
                                    setModalVisible(true);
                                }}
                            >
                                <Icon name="reply" size={28} type="material-community" color={'#FF7400'} />
                            </TouchableOpacity>
                            <TouchableOpacity  
                                    style={{ marginHorizontal: 20 }}
                                    onPress={() => {setReportModalVisible(true)}}
                            >
                                <Icon name="flag" size={20} type="material-community" color={'#FF7400'} />
                            </TouchableOpacity>
                            {/* <TouchableOpacity  style={{ marginHorizontal: 30, padding: 5,  borderWidth:1, borderColor:'#FF7400', borderRadius: 5 }}>
                                <Text style={[styles.threadAuthor, {fontSize: 10}]}>report</Text>
                            </TouchableOpacity> */}
                        </View>
                        {item.comments.map(comment => (
                            <Comment key={comment.id} comment={comment} />
                        ))}
                    </View>
                )}
            />

            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => {
                    setModalVisible(!isModalVisible);
                    setNewCommentContent('');
                }}
            >
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalView}>
                            <TouchableOpacity
                                style={{ alignSelf: 'flex-end' }}
                                hitSlop={20}
                                onPress={closeModal}
                            >
                                <Icon name="close" size={20} type="font-awesome" color={'white'} />
                            </TouchableOpacity>
                            <Text style={styles.headerTxt}>Create New Comment</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Text"
                                placeholderTextColor="gray"
                                value={newCommentContent}
                                onChangeText={handleContentChange}
                                multiline={true}
                                maxLength={maxContentLength}
                            />
                            <Text style={styles.charCount}>
                                {maxContentLength - remainingChars} / 25000
                            </Text>

                            <LinearGradient
                                colors={isFormValid ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#A9A9A9']}
                                style={[styles.orangeButtonGradient, { marginTop: 20 }]}
                            >
                                <TouchableOpacity
                                    style={[styles.orangeButton]}
                                    onPress={createNewComment}
                                    disabled={!isFormValid}
                                >
                                    <Text style={[styles.buttonText]}>Post Comment</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ////////REPORT MODAL////// */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isReportModalVisible}
                onRequestClose={() => {
                    setReportModalVisible(!isReportModalVisible);
                    setNewCommentContent('');
                }}
            >
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalView}>
                            <TouchableOpacity
                                style={{ alignSelf: 'flex-end' }}
                                hitSlop={20}
                                onPress={() => {setReportModalVisible(false), setNewCommentContent('')}}
                            >
                                <Icon name="close" size={20} type="font-awesome" color={'white'} />
                            </TouchableOpacity>
                            <Text style={styles.headerTxt}>What type of issue are you reporting?</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Text"
                                placeholderTextColor="gray"
                                value={newCommentContent}
                                onChangeText={setNewCommentContent}
                                multiline={true}
                                maxLength={1000}
                            />

                            <LinearGradient
                                colors={isFormValid ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#A9A9A9']}
                                style={[styles.orangeButtonGradient, { marginTop: 20 }]}
                            >
                                <TouchableOpacity
                                    style={[styles.orangeButton]}
                                    onPress={onReportSubmit}
                                    disabled={!isFormValid}
                                >
                                    <Text style={[styles.buttonText]}>Send Report</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ////////REPORT-BLOCK USER MODAL////// */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isReportUserModalVisible}
                onRequestClose={() => {
                    setReportModalVisible(!isReportUserModalVisible);
                    setNewCommentContent('');
                }}
            >
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalView}>
                            <TouchableOpacity
                                style={{ alignSelf: 'flex-end' }}
                                hitSlop={20}
                                onPress={() => {setReportUserModalVisible(false), setNewCommentContent('')}}
                            >
                                <Icon name="close" size={20} type="font-awesome" color={'white'} />
                            </TouchableOpacity>
                            <View style ={{alignItems:"center", justifyContent: 'center'}}>
                                <Text style={styles.headerTxt}>Block User</Text>
                                <Text style={[styles.headerTxt, {alignSelf: 'center',marginTop: 40,  color: '#FF7400'}]}>Are you sure you want to block user {userNameToBlock}?</Text>
                                <Text textAlign='center' style={[styles.threadTxt, { marginTop: 40}]}>Bloced user will be able to see your public posts, but will no longer be able to engage with them. You will not be able to see posts from blocked users. </Text>
                            </View>
                           
                            <LinearGradient
                                colors={ ['#FFB67D', '#FF8A3E', '#FF7400']}
                                style={[styles.orangeButtonGradient, { marginTop: 20 }]}
                            >
                                <TouchableOpacity
                                    style={[styles.orangeButton]}
                                    onPress={() => {
                                        console.log('userIdToBlock', userIdToBlock)
                                        blockUser(userIdToBlock); 
                                    }}
                                    
                                >
                                    <Text style={[styles.buttonText]}>Block User</Text>
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};


const styles = StyleSheet.create({
    center: {
        marginTop: 20,
        height:80,
        flexDirection:'row',
        marginHorizontal: 16,
        justifyContent:'center',
        alignItems:'center'
    },
    header: {
        flexDirection:'row', 
        marginVertical: 20, 
        marginLeft: 20,
        alignItems: 'center'
    },
    headerTxt: {
        fontSize: 18,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        alignSelf: 'center',
        textAlign: 'center'
    },
    filterBlock: {
        width:'100%',
        flexDirection:'row',
        padding: 10,
    },
    filterButton: {
        height: 24,
        borderRadius: 10,
        justifyContent:'center',
        alignItems:'center',
        padding: 5, 
        marginHorizontal: 5
    },
    filterButtonText: {
        color:'white', 
        fontSize: 10,
        fontFamily: 'Orbitron-Black',
        letterSpacing: 1.2, 
    },
    filterDescriptionText: {
        color:'white', 
        fontSize: 15,
        fontFamily: 'Orbitron-Regular',
        letterSpacing: 1.2, 
    },
    filterButtonGradientActive: {
        height: 24,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
        justifyContent:'center',
        alignItems:'center',
    },
    filterButtonGradientInactive: {
        height: 24,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        justifyContent:'center',
        alignItems:'center',
        backgroundColor: '#B0B0B0', 
    },
    threadBlock: {
        backgroundColor: '#2F2D2B',
        padding: 15,
        borderRadius: 5,
        marginVertical: 8,
        marginHorizontal: 10,
    },
    threadTxt: {
        fontSize: 16,
        color: 'white',
        marginBottom: 10,
        marginTop: 8,
        lineHeight: 21
    },
    threadAuthor: {
        fontSize: 14,
        color: '#FF7400',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 3,
        letterSpacing: 1.1
    },
    threadDate: {
        fontSize: 14,
        color: 'grey',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 3,
        letterSpacing: 1.1
    },
    threadReplies: {
        fontSize: 16,
        color: 'white',
        marginBottom: 5,
        marginTop: 5,
        lineHeight: 20
    },
    commentBlock: {
        backgroundColor: '#444444', // Darker than threadBlock
        padding: 10,
        borderRadius: 5,
        marginVertical: 4,
        marginHorizontal: 20, // Indent comments to visually nest under the message
    },
    orangeButton: {
        height: 36,
        width: 200,
        borderRadius: 10,
        justifyContent:'center',
        marginBottom: 12, 
        textAlign:'center',
    },
    orangeButtonGradient: {
        height: 36,
        width: 200,
        borderRadius: 10,
        marginVertical: 12, 
    },
    buttonText: {
        color:'white', 
        textAlign: 'center',
        fontSize: 15,
        fontWeight:"600",
        fontFamily: 'Orbitron-Regular',
        letterSpacing: 1.1, 
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalView: {
        width: '100%',
        height: '75%',
        backgroundColor: "black",
        borderRadius: 20,
        padding: 35,
        alignItems: "center",
    },
    input: {
        width: '100%',
        height: 40,
        borderRadius: 5,
        borderColor: 'white',
        borderWidth: 0.5,
        marginTop: 30,
        backgroundColor: '#2F2D2B',
        padding: 10,
        paddingTop: 12,
        fontFamily: "Orbitron-Regular",
        color: 'white',
        fontWeight:"400",
        letterSpacing: 1.1, 

    },
    textArea: {
        height: 200,
        textAlignVertical: 'top'
    },
    charCount: {
        color: 'white',
        fontSize: 12,
        fontFamily: 'Orbitron-Regular',
        letterSpacing: 1.1,
        marginTop: 5,
        alignSelf: "flex-end"
    },
});

export default ForumThreadScreen;
