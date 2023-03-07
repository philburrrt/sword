import React, { useRef, useEffect } from 'react'
import {
  useSyncState,
  Vector3,
  Euler,
  useWorld,
  useFile,
  useFields,
  randomInt,
  useEntityUid,
} from 'hyperfy'

// TODO: Obfuscate event names

const v1 = new Vector3()
const e1 = new Euler()

const DEFAULT_MODEL = 'sword.glb'
const DEFAULT_EQUIP_AUDIO = 'SwordEquip.mp3'
const DEFAULT_SWING_AUDIO = 'SwordSwing.mp3'

export default function App() {
  const world = useWorld()
  const entityId = useEntityUid()
  const swordRef = useRef()
  const equipRef = useRef()
  const swingRef = useRef()
  const healthBarRef = useRef()
  const {
    activePosition,
    activeRotation,
    sheathedPosition,
    sheathedRotation,
    swordModel,
    equipAudio,
    swingAudio,
  } = useFields()
  const [s, dispatch] = useSyncState(s => s)
  const { holder, mode, health, deadHolder } = s
  const swingSfx = useFile(swingAudio) || DEFAULT_SWING_AUDIO
  const equipSfx = useFile(equipAudio) || DEFAULT_EQUIP_AUDIO
  const sword = useFile(swordModel) || DEFAULT_MODEL

  useEffect(() => {
    if (!world.isServer) return
    if (!deadHolder) return
    world.emit('death', { uid: deadHolder })
  }, [deadHolder])

  // * Attaches sword to parts of the body * //
  useEffect(() => {
    if (!world.isClient) return
    if (!holder) return
    const sword = swordRef.current
    const healthBar = healthBarRef.current
    if (mode === 'active') {
      return world.onUpdate(delta => {
        const avatar = world.getAvatar(holder)
        avatar.getBonePosition('head', v1)
        healthBar.setPosition(v1)
        avatar.getBonePosition('rightHand', v1)
        sword.setPosition(v1)
        avatar.getBoneRotation('rightHand', e1)
        sword.setRotation(e1)
      })
    } else if (mode === 'sheathed') {
      return world.onUpdate(delta => {
        const avatar = world.getAvatar(holder)
        avatar.getBonePosition('hips', v1)
        sword.setPosition(v1)
        avatar.getBoneRotation('hips', e1)
        sword.setRotation(e1)
      })
    }
  }, [holder, mode])

  // * Handles attacks and sheathing * //
  // only should run if local player is holding the sword
  useEffect(() => {
    if (!world.isClient) return
    if (world.getAvatar()?.uid !== holder) return
    const swingSfx = swingRef.current
    const equipSfx = equipRef.current
    if (mode === 'active') {
      equipSfx.play(true)
    } else if (mode === 'sheathed') {
      equipSfx.play(true)
    }
    let longPressTimer = null
    let nextAllowedAttack = -9999
    let lastAction = 'attack1'
    function doAttack() {
      const time = world.getTime()
      if (nextAllowedAttack > time) return
      const avatar = world.getAvatar()
      const ray = avatar.getRay()
      const hit = world.raycast(ray)
      if (hit?.entity.isAvatar) {
        const dmg = randomInt(33, 66)
        world.emit('attack', { uid: hit.entity.uid, dmg })
      }
      const action = lastAction === 'attack1' ? 'attack2' : 'attack1'
      world.emote(action)
      swingSfx.play(true)
      nextAllowedAttack = time + 0.5
      lastAction = action
    }
    function doToggleMode() {
      dispatch(mode === 'active' ? 'deactivate' : 'activate')
    }
    function onPointerDown(event) {
      if (!mode) return
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        doToggleMode()
      }, 500)
    }
    function onPointerUp(event) {
      if (!longPressTimer) return // long press happened
      clearTimeout(longPressTimer)
      longPressTimer = null
      if (mode !== 'active') return
      doAttack()
    }
    const onSomethingHeld = msg => {
      // semi-standard event called when any app "holds" an item
      // so that people don't hold multiple items in their hand
      if (msg.entityId !== entityId) {
        dispatch('reset')
      }
    }
    world.on('pointer-down', onPointerDown)
    world.on('pointer-up', onPointerUp)
    world.on('held', onSomethingHeld)
    return () => {
      world.off('pointer-down', onPointerDown)
      world.off('pointer-up', onPointerUp)
      world.off('held', onSomethingHeld)
    }
  }, [mode])

  useEffect(() => {
    if (!world.isServer) return
    // this needs to know UID because it will occur on the server after the client has left
    const onLeave = avatar => {
      dispatch('unequip', avatar.uid)
    }
    world.on('leave', onLeave)
    return () => {
      world.off('leave', onLeave)
    }
  }, [])

  useEffect(() => {
    return world.on('attack', ({ uid, dmg }) => {
      dispatch('damage', uid, dmg)
    })
  }, [])

  return (
    <app>
      <box
        position={[-2, 0, 0]}
        color="black"
        scale={[0.1, 0.1, 0.1]}
        onPointerDown={e => {
          const { uid } = e.avatar
          dispatch('unequip', uid)
        }}
      />
      <emote id="attack1" src="Stable Sword Outward Slash.fbx" upperBody />
      <emote id="attack2" src="Stable Sword Inward Slash.fbx" upperBody />
      {holder ? (
        <>
          <global>
            <billboard ref={healthBarRef} axis="y">
              <panel
                size={[0.2, 0.025]}
                canvasSize={[128, 128]}
                unitSize={1}
                style={{ bg: 'rgba(0,0,0,.2)' }}
                position={[0, 0.4, 0]}
              >
                <rect
                  style={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: health + '%',
                    bg: '#e83232',
                  }}
                />
              </panel>
            </billboard>
            <group ref={swordRef}>
              <model
                layer="HELD"
                src={sword}
                position={mode === 'active' ? activePosition : sheathedPosition}
                rotation={mode === 'active' ? activeRotation : sheathedRotation}
              />
              <audio ref={equipRef} src={equipSfx} spatial />
              <audio ref={swingRef} src={swingSfx} spatial />
            </group>
          </global>
        </>
      ) : (
        <model
          src="sword.glb"
          onPointerDown={e => {
            const { uid } = e.avatar
            dispatch('equip', uid)
            world.emit('held', { entityId })
          }}
        />
      )}
    </app>
  )
}

const initialState = {
  holder: null,
  health: null,
  mode: null, // active, sheathed
  deadHolder: null,
}

export function getStore(state = initialState) {
  return {
    state,
    actions: {
      equip(state, holder) {
        state.holder = holder
        state.health = 100
        state.mode = 'active'
      },
      unequip(state, holder) {
        if (state.holder !== holder) return
        state.holder = null
        state.mode = null
      },
      activate(state) {
        state.mode = 'active'
      },
      deactivate(state) {
        state.mode = 'sheathed'
      },
      damage(state, holder, dmg) {
        if (state.holder !== holder) return
        state.health -= dmg
        if (state.health <= 0) {
          state.holder = null
          state.mode = null
          state.deadHolder = holder
        }
      },
      reset(state) {
        state.holder = null
        state.mode = null
        state.deadHolder = null
        state.health = null
      },
    },
    fields: [
      {
        key: 'swordModel',
        label: 'Sword Model',
        type: 'file',
        accept: '.glb',
      },
      {
        key: 'equipAudio',
        label: 'Equip Sound',
        type: 'file',
        accept: '.mp3',
      },
      {
        key: 'swingAudio',
        label: 'Swing Sound',
        type: 'file',
        accept: '.mp3',
      },
      {
        key: 'activePosition',
        label: 'Active Position',
        type: 'vec3',
        initial: [0, 0, 0],
      },
      {
        key: 'activeRotation',
        label: 'Active Rotation',
        type: 'vec3',
        initial: [0, 0, 0],
      },
      {
        key: 'sheathedPosition',
        label: 'Sheathed Position',
        type: 'vec3',
        // initial: [0, 0, 0],
        initial: [0.2, 0, -0.2],
      },
      {
        key: 'sheathedRotation',
        label: 'Sheathed Rotation',
        type: 'vec3',
        // initial: [0, 0, 0],
        initial: [0.2, -3, 0.9],
      },
    ],
  }
}
