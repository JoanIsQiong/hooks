import Taro from '@tarojs/taro';
import { useMemoizedFn, useUnmount } from 'ahooks';
import { useEffect, useRef, useState } from 'react';

export enum ReadyState {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}
interface Options {
  reconnectLimit?: number;
  reconnectInterval?: number;
  manual?: boolean;
  onOpen?: (event: WebSocketEventMap['open'], instance: WebSocket) => void;
  onClose?: (event: WebSocketEventMap['close'], instance: WebSocket) => void;
  onMessage?: (
    message: WebSocketEventMap['message'],
    instance: WebSocket
  ) => void;
  onError?: (event: WebSocketEventMap['error'], instance: WebSocket) => void;
  protocols?: string | string[];
}
interface Result {
  latestMessage?: string;
  sendMessage: (msg: string) => void;
  disconnect: () => void;
  connect: () => void;
  readyState: ReadyState;
  webSocketIns?: Taro.SocketTask;
}

const useWebsocket = (socketUrl: string, options: Options = {}): Result => {
  const {
    reconnectLimit = 5,
    reconnectInterval = 5 * 1000,
    manual = false,
  } = options;
  //   const [service,method] = socketUrl.split('/ws/')[1].split('/')
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectTimesRef = useRef(0);
  const websocketRef = useRef<Taro.SocketTask>();
  const unmountedRef = useRef(false);

  const [latestMessage, setLatestMessage] = useState();
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.CLOSED);

  const sendMessage = (data: string) => {
    if (readyState === ReadyState.OPEN) {
      Taro.sendSocketMessage({ data });
    } else {
      throw new Error('WebSocket disconnected');
    }
  };
  const connectWs = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (readyState === ReadyState.OPEN) Taro.closeSocket();
    Taro.connectSocket({
      url: socketUrl,
    }).then((SocketTask) => {
    //   console.log(SocketTask, 'SocketTask');
      setReadyState(ReadyState.CONNECTING);
      SocketTask.onError((res) => {
        if (unmountedRef.current) return;
        console.log(res, 'WebSocket连接打开失败，请检查！');
        reconnect();
        setReadyState(SocketTask.readyState || ReadyState.CLOSED);
      });
      SocketTask.onClose((res) => {
        if (unmountedRef.current) return;
        console.log(res, 'WebSocket 已关闭！');
        setReadyState(ReadyState.CLOSING);
        reconnect();
        setReadyState(SocketTask.readyState || ReadyState.CLOSED);
      });
      SocketTask.onOpen((res) => {
        if (unmountedRef.current) return;
        console.log(res, 'WebSocket连接已打开！');
        reconnectTimesRef.current = 0;
        setReadyState(SocketTask.readyState || ReadyState.OPEN);
      });
      SocketTask.onMessage((res) => {
        if (unmountedRef.current) return;
        // console.log('收到服务器内容：' + res.data);
        setLatestMessage(res.data);
      });
      websocketRef.current = SocketTask;
    });
  };
  const reconnect = () => {
    if (
      reconnectTimesRef.current <= reconnectLimit &&
      readyState !== ReadyState.OPEN
    ) {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connectWs();
        reconnectTimesRef.current++;
      }, reconnectInterval);
    }
  };
  const connect = () => {
    reconnectTimesRef.current = 0;
    connectWs();
  };
  const disconnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (readyState === ReadyState.OPEN) Taro.closeSocket();
    reconnectTimesRef.current = reconnectLimit;
  };

  useEffect(() => {
    if (!manual) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketUrl, manual]);

  useUnmount(() => {
    unmountedRef.current = true;
    disconnect();
  });
  return {
    latestMessage,
    sendMessage: useMemoizedFn(sendMessage),
    connect: useMemoizedFn(connect),
    disconnect: useMemoizedFn(disconnect),
    readyState,
    webSocketIns: websocketRef.current,
  };
};

export default useWebsocket;
