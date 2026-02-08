import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socketInstance = io('/', {
      transports: ['websocket', 'polling'],
    })

    socketInstance.on('connect', () => {
      console.log('🔌 Socket conectado:', socketInstance.id)
      setConnected(true)
    })

    socketInstance.on('disconnect', () => {
      console.log('🔌 Socket desconectado')
      setConnected(false)
    })

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Erro de conexão:', error)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket deve ser usado dentro de SocketProvider')
  }
  return context
}

// Hook para escutar eventos específicos
export function useSocketEvent(eventName, callback) {
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket || !eventName || !callback) return

    socket.on(eventName, callback)

    return () => {
      socket.off(eventName, callback)
    }
  }, [socket, eventName, callback])
}

// Hook para entrar em uma sala
export function useSocketRoom(roomName) {
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket || !roomName) return

    socket.emit('join-room', roomName)

    return () => {
      socket.emit('leave-room', roomName)
    }
  }, [socket, roomName])
}
