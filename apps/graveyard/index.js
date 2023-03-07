import React, { useEffect } from 'react'
import { useWorld } from 'hyperfy'

export default function App() {
  const world = useWorld()

  useEffect(() => {
    if (!world.isServer) return
    return world.on('hfy-death', msg => {
      const { uid } = msg
      const avatar = world.getAvatar(uid)
      if (!avatar) return console.error('no avatar to kill')
      avatar.teleport('graveyard')
    })
  }, [])

  return (
    <app>
      <place label="graveyard" />
      <model src="tombstone.glb" />
    </app>
  )
}
