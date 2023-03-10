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

const v1 = new Vector3()
const e1 = new Euler()

const DEFAULT_MODEL = 'katana.glb'
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
    pos,
    rot,
    mountedPos,
    mountedRot,
    scale,
    swordModel,
    equipAudio,
    swingAudio,
    minDamage,
    maxDamage,
  } = useFields()
  const [s, dispatch] = useSyncState(s => s)
  const { holder, health, deadHolder } = s
  const swingSfx = useFile(swingAudio) || DEFAULT_SWING_AUDIO
  const equipSfx = useFile(equipAudio) || DEFAULT_EQUIP_AUDIO
  const sword = useFile(swordModel) || DEFAULT_MODEL
  const localUser = world.getAvatar()?.uid

  useEffect(() => {
    if (!world.isServer) return
    if (!deadHolder) return
    world.emit('hfy-death', { uid: deadHolder })
  }, [deadHolder])

  // * Attaches sword to parts of the body * //
  useEffect(() => {
    if (!world.isClient) return
    if (!holder) return
    const sword = swordRef.current
    const healthBar = healthBarRef.current
    return world.onUpdate(delta => {
      const avatar = world.getAvatar(holder)
      avatar.getBonePosition('head', v1)
      healthBar.setPosition(v1)
      avatar.getBonePosition('rightHand', v1)
      sword.setPosition(v1)
      avatar.getBoneRotation('rightHand', e1)
      sword.setRotation(e1)
    })
  }, [holder])

  // * Handles attacks and sheathing * //
  // only should run if local player is holding the sword
  useEffect(() => {
    if (!world.isClient) return
    if (!holder || holder !== localUser) return
    const pickupTime = world.getTime()
    const swingSfx = swingRef.current
    let nextAllowedAttack = -9999
    let lastAction = 'attack1'
    function onPointerUp(e) {
      if (pickupTime + 0.5 > world.getTime()) return
      if (!holder) return
      const time = world.getTime()
      if (nextAllowedAttack > time) return
      const avatar = world.getAvatar()
      const ray = avatar.getRay()
      const hit = world.raycast(ray)
      if (hit?.entity.isAvatar) {
        const dmg = randomInt(minDamage, maxDamage)
        world.emit('katana-attack', { uid: hit.entity.uid, dmg })
      }
      const action = lastAction === 'attack1' ? 'attack2' : 'attack1'
      world.emote(action)
      swingSfx.play(true)
      nextAllowedAttack = time + 0.5
      lastAction = action
    }
    const onSomethingHeld = msg => {
      // semi-standard event called when any app "holds" an item
      // so that people don't hold multiple items in their hand
      if (msg.entityId !== entityId) {
        dispatch('reset')
      }
    }
    world.on('pointer-up', onPointerUp)
    world.on('held', onSomethingHeld)
    return () => {
      world.off('pointer-up', onPointerUp)
      world.off('held', onSomethingHeld)
    }
  }, [holder])

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
    return world.on('katana-attack', ({ uid, dmg }) => {
      dispatch('damage', uid, dmg)
    })
  }, [])

  return (
    <app>
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
                position={pos}
                rotation={rot}
                scale={scale}
              />
              <audio ref={swingRef} src={swingSfx} spatial />
            </group>
          </global>
        </>
      ) : (
        <>
          <model
            src={sword}
            onPointerDown={e => {
              const { uid } = e.avatar
              dispatch('equip', uid)
              const sfx = equipRef.current
              sfx.play(true)
              world.emit('held', { entityId })
            }}
            onPointerDownHint="Equip"
            position={mountedPos}
            rotation={mountedRot}
            scale={scale}
          />
          <audio ref={equipRef} src={equipSfx} spatial />
        </>
      )}
      {holder !== localUser && <model src="holder.glb" />}
      {holder && holder === localUser && (
        <>
          <model
            src={'holder-owned.glb'}
            onPointerDown={e => {
              if (!holder) return
              const { uid } = e.avatar
              dispatch('unequip', uid)
              const sfx = equipRef.current
              sfx.play(true)
            }}
            onPointerDownHint="Unequip"
          />
          <audio ref={equipRef} src={equipSfx} spatial />
        </>
      )}
    </app>
  )
}

const initialState = {
  holder: null,
  health: null,
  deadHolder: null,
}

export function getStore(state = initialState) {
  return {
    state,
    actions: {
      equip(state, holder) {
        state.holder = holder
        state.health = 100
      },
      unequip(state, holder) {
        if (state.holder !== holder) return
        state.holder = null
      },
      damage(state, holder, dmg) {
        if (state.holder !== holder) return
        state.health -= dmg
        if (state.health <= 0) {
          state.holder = null
          state.deadHolder = holder
        }
      },
      reset(state) {
        state.holder = null
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
        key: 'scale',
        label: 'Scale',
        type: 'float',
        initial: 1.0,
      },
      {
        key: 'maxDamage',
        label: 'Max Damage',
        type: 'float',
        initial: 66,
      },
      {
        key: 'minDamage',
        label: 'Min Damage',
        type: 'float',
        initial: 33,
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
        key: 'pos',
        label: 'Position',
        type: 'vec3',
        initial: [0.07, -0.07, 0],
      },
      {
        key: 'rot',
        label: 'Rotation',
        type: 'vec3',
        initial: [-1.2, 0, 1.4],
      },
      {
        key: 'mountedPos',
        label: 'Mounted Position',
        type: 'vec3',
        initial: [0, 0, 0],
      },
      {
        key: 'mountedRot',
        label: 'Mounted Rotation',
        type: 'vec3',
        initial: [0, 0, 0],
      },
    ],
  }
}
