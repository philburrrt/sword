import React, { useEffect, useRef, useState } from 'react'
import { useWorld, Vector3, Euler, useSyncState } from 'hyperfy'

const v1 = new Vector3()

const bv3 = (x, y, z) => [x, z, -y]
const localChat = (msg, world) => {
  world.chat(msg, false, true)
}

const App = () => {
  const world = useWorld()
  return <app>{world.isClient && <CombatText world={world} />}</app>
}
export default App

const CombatText = ({ world }) => {
  const [combatText, dispatch] = useSyncState(s => s.combatText)
  useEffect(() => {
    return world.on('hfy-attack', ({ uid, dmg }) => {
      localChat(`You hit ${uid} for ${dmg} damage!`, world)
      const avatar = world.getAvatar(uid)
      if (!avatar) return
      avatar.getBonePosition('head', v1)
      const pos = v1.toArray()
      localChat(`converted pos: ${pos}`, world)
    })
  }, [])
  return (
    <>
      {combatText &&
        combatText.map(({ dmg, pos }, i) => (
          <billboard axis="y">
            <text
              key={i}
              text={dmg}
              color="red"
              bgColor="white"
              padding={0.1}
              bgRadius={0.1}
            />
          </billboard>
        ))}
    </>
  )
}

const initialState = {
  combatText: [], // { dmg, pos }
}
export const getStore = (state = initialState) => {
  return {
    state,
    actions: {
      addText: (state, msg) => {
        state.combatText.push(msg)
      },
      removeText: (state, msg) => {
        state.combatText = state.combatText.filter(
          t => t.dmg !== msg.dmg && t.pos !== msg.pos
        )
      },
    },
  }
}
