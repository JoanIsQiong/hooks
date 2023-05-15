import { useEffect, useRef, useState } from 'react';
import { useLatest, useMemoizedFn, useUnmount } from 'ahooks';
import Taro from '@tarojs/taro';

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface Options {
  reconnectLimit?: number;
  reconnectInterval?: number;
  manual?: boolean;
  onOpen?: (
    event: Taro.SocketTask.OnOpenCallbackResult,
    instance: Taro.SocketTask
  ) => void;
  onClose?: (
    event: Taro.SocketTask.OnCloseCallbackResult,
    instance: Taro.SocketTask
  ) => void;
  onMessage?: (
    message: Taro.SocketTask.OnMessageCallbackResult<any>,
    instance: Taro.SocketTask
  ) => void;
  onError?: (
    event: Taro.SocketTask.OnErrorCallbackResult,
    instance: Taro.SocketTask
  ) => void;
  protocols?: string[];
}

export interface Result {
  latestMessage?: Taro.SocketTask.OnMessageCallbackResult<any>;
  sendMessage?: (message: Taro.sendSocketMessage.Option) => void;
  disconnect?: () => void;
  connect?: () => void;
  readyState: ReadyState;
  webSocketIns?: Taro.SocketTask;
}

export default function useWebSocket(
  socketUrl: string,
  options: Options = {}
): Result {
  const {
    reconnectLimit = 3,
    reconnectInterval = 3 * 1000,
    manual = false,
    onOpen,
    onClose,
    onMessage,
    onError,
    protocols,
  } = options;

  const onOpenRef = useLatest(onOpen);
  const onCloseRef = useLatest(onClose);
  const onMessageRef = useLatest(onMessage);
  const onErrorRef = useLatest(onError);

  const reconnectTimesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const websocketRef = useRef<Taro.SocketTask>();

  const unmountedRef = useRef(false);

  const [latestMessage, setLatestMessage] = useState<
    Taro.SocketTask.OnMessageCallbackResult<any>
  >();
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.CLOSED);

  const reconnect = () => {
    if (
      reconnectTimesRef.current < reconnectLimit &&
      websocketRef.current?.readyState !== ReadyState.OPEN
    ) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        connectWs();
        reconnectTimesRef.current++;
      }, reconnectInterval);
    }
  };

  const connectWs = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (websocketRef.current) {
      websocketRef.current.close({});
    }
    Taro.connectSocket({ url: socketUrl, protocols }).then((SocketTask) => {
      console.log(socketUrl, SocketTask, 'SocketTask');
      setReadyState(ReadyState.CONNECTING);
      SocketTask.onError((event) => {
        if (unmountedRef.current) return;
        console.log(event, 'WebSocket连接打开失败，请检查！');
        reconnect();
        onErrorRef.current?.(event, SocketTask);
        setReadyState(SocketTask.readyState || ReadyState.CLOSED);
      });
      SocketTask.onOpen((event) => {
        if (unmountedRef.current) return;
        console.log(event, 'WebSocket连接已打开！');
        onOpenRef.current?.(event, SocketTask);
        reconnectTimesRef.current = 0;
        setReadyState(SocketTask.readyState || ReadyState.OPEN);
      });
      SocketTask.onMessage((message) => {
        if (unmountedRef.current) return;
        // console.log('收到服务器内容：' + message.data);
        onMessageRef.current?.(message, SocketTask);
        setLatestMessage(message);
      });
      SocketTask.onClose((event) => {
        if (unmountedRef.current) return;
        console.log(event, 'WebSocket 已关闭！');
        reconnect();
        onCloseRef.current?.(event, SocketTask);
        setReadyState(SocketTask.readyState || ReadyState.CLOSED);
      });
      websocketRef.current = SocketTask;
    });
  };

  const sendMessage = (message: Taro.sendSocketMessage.Option) => {
    if (readyState === ReadyState.OPEN) {
      console.log(message, 'sendMessage');
      websocketRef.current?.send(message);
    } else {
      throw new Error('WebSocket disconnected');
    }
  };

  const connect = () => {
    reconnectTimesRef.current = 0;
    connectWs();
  };

  const disconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimesRef.current = reconnectLimit;
    websocketRef.current?.close({});
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
}
