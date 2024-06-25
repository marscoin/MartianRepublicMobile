import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, Dimensions, Modal, StyleSheet, View, Text, TouchableOpacity, FlatList } from 'react-native';
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
    const threadTitle = route.params.thread.title;
    const threadId = route.params.thread.id;
    const [threadData, setThreadData] = useState('');
    const [replyToPostId, setReplyToPostId] = useState(null);
    const [isModalVisible, setModalVisible] = useState(false);
    const [newCommentContent, setNewCommentContent] = useState('');

    const transformThreadData = (data) => {
        let messages = [];
        let messageMap = {};
        data.forEach(item => {
            const comment = { ...item, comments: [] };

            if (comment.pid === null) {
                messages.push(comment);
                messageMap[comment.id] = comment;
            } else {
                if (messageMap[comment.pid]) {
                    messageMap[comment.pid].comments.push(comment);
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
            const formattedData = transformThreadData(response.data.comments.original.comments);
            setThreadData(formattedData);
        } catch (error) {
            console.error('Error fetching thread data:', error);
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
        setModalVisible(false);
        setNewCommentContent('');
        setReplyToPostId(null);
        fetchThreadData(); 
    }

    const Comment = ({ comment }) => (
        <View style={styles.commentBlock}>
            <Text style={styles.threadReplies}>{comment.content}</Text>
            <Text style={styles.threadAuthor}>{comment.fullname}</Text>
            <Text style={styles.threadDate}>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</Text>
            {/* <TouchableOpacity 
                style={{alignSelf: 'flex-end', marginVertical: 5}}
                hitSlop={20}
                onPress={() => {
                    setReplyToPostId(comment.id);
                    setModalVisible(true);
                }}
            >
                <Icon name="reply" size={28} type="material-community" color={'#FF7400'} />
            </TouchableOpacity> */}
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
                        <Text style={styles.threadAuthor}>{item.fullname}</Text>
                        <Text style={styles.threadDate}>
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </Text>
                        <Text style={styles.threadTxt}>{item.content}</Text>
                        <TouchableOpacity
                            style={{ alignSelf: 'flex-end', marginVertical: 5 }}
                            hitSlop={20}
                            onPress={() => {
                                setReplyToPostId(item.id);
                                setModalVisible(true);
                            }}
                        >
                            <Icon name="reply" size={28} type="material-community" color={'#FF7400'} />
                        </TouchableOpacity>
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
                }}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalView}>
                        <TouchableOpacity
                            style={{ alignSelf: 'flex-end' }}
                            hitSlop={20}
                            onPress={() => setModalVisible(false)}
                        >
                            <Icon name="close" size={20} type="font-awesome" color={'white'} />
                        </TouchableOpacity>
                        <Text style={styles.headerTxt}>Create New Comment</Text>
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
                            style={[styles.orangeButtonGradient, { marginTop: 40 }]}
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
        height: '66%',
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
        height: 230,
        textAlignVertical: 'top'
    },
});

export default ForumThreadScreen;
