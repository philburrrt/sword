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

export const App = () => {
  const world = useWorld()
  const entityId = useEntityUid()
  const weaponRef = useRef()
  const equipRef = useRef()
  const attackRef = useRef()
  const healthBarRef = useRef()
  const {
    mode,
    pos,
    rot,
    mountedPos,
    mountedRot,
    scale,
    model,
    equipAudio,
    attackAudio,
    minDamage,
    maxDamage,
    regenRate,
    attackSpeed,
    attackRange,
  } = useFields()

  const DEFAULT_MODEL = mode === 'sword' ? 'katana.glb' : 'gun.glb'
  const DEFAULT_EQUIP_AUDIO =
    mode === 'sword' ? 'sword-equip.mp3' : 'gun-equip.mp3'
  const DEFAULT_ATTACK_AUDIO = mode === 'sword' ? 'sword.mp3' : 'gun.mp3'
  const DEFAULT_POSITION =
    mode === 'sword' ? [0.07, -0.07, 0] : [-0.1, -0.05, 0]
  const DEFAULT_ROTATION = mode === 'sword' ? [-1.2, 0, 1.4] : [-0.9, 0, 0.3]

  const [s, dispatch] = useSyncState(s => s)
  const { holder, health, deadHolder } = s
  const attackSfx = useFile(attackAudio) || DEFAULT_ATTACK_AUDIO
  const equipSfx = useFile(equipAudio) || DEFAULT_EQUIP_AUDIO
  const position = model ? pos : DEFAULT_POSITION
  const rotation = model ? rot : DEFAULT_ROTATION
  const weapon = useFile(model) || DEFAULT_MODEL
  const localUser = world.getAvatar()?.uid

  useEffect(() => {
    if (!world.isServer) return
    if (!deadHolder) return
    world.emit('hfy-death', { uid: deadHolder })
    dispatch('resetDeath')
  }, [deadHolder])

  // * Attaches sword to parts of the body * //
  useEffect(() => {
    if (!world.isClient) return
    if (!holder) return
    const weapon = weaponRef.current
    const healthBar = healthBarRef.current
    return world.onUpdate(delta => {
      const avatar = world.getAvatar(holder)
      avatar.getBonePosition('head', v1)
      healthBar.setPosition(v1)
      avatar.getBonePosition('rightHand', v1)
      weapon.setPosition(v1)
      avatar.getBoneRotation('rightHand', e1)
      weapon.setRotation(e1)
    })
  }, [holder])

  // * Handles attacks and sheathing * //
  // only should run if local player is holding the weapon
  useEffect(() => {
    if (!world.isClient) return
    if (!holder || holder !== localUser) return
    const pickupTime = world.getTime()
    const attackSfx = attackRef.current
    let lastAction = 'attack1'
    let nextAllowedAttack = -9999
    const onPointerUp = e => {
      if (pickupTime + 0.5 > world.getTime()) return
      if (!holder) return
      const time = world.getTime()
      if (nextAllowedAttack > time) return
      const avatar = world.getAvatar()
      const ray = avatar.getRay()
      const hit = world.raycast(ray)
      if (hit?.entity.isAvatar && hit.distance < attackRange) {
        const dmg = randomInt(minDamage, maxDamage)
        world.emit('katana-attack', { uid: hit.entity.uid, dmg })
      }
      let action
      if (mode === 'sword') {
        action = lastAction === 'attack1' ? 'attack2' : 'attack1'
      } else if (mode === 'gun') {
        action = 'shoot'
      }
      world.emote(action)
      attackSfx.play(true)
      nextAllowedAttack = time + attackSpeed
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
  }, [holder, attackSpeed, mode])

  useEffect(() => {
    // heal the holder for regenRate every second
    if (!world.isServer) return
    if (!holder) return
    const regen = () => {
      dispatch('heal', holder, regenRate)
      setTimeout(regen, 1000)
    }
    setTimeout(regen, 1000)
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
      <emote id="shoot" src="Gunplay.fbx" fadeOut={1} upperBody />
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
            <group ref={weaponRef}>
              <model
                layer="HELD"
                src={weapon}
                position={position}
                rotation={rotation}
                scale={scale}
              />
              <audio ref={attackRef} src={attackSfx} spatial />
            </group>
          </global>
        </>
      ) : (
        <>
          <model
            src={weapon}
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
export default App

const initialState = {
  holder: null,
  health: null,
  deadHolder: null,
}

export const getStore = (state = initialState) => {
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
      heal(state, holder, amt) {
        if (state.holder !== holder) return
        state.health += amt
        if (state.health > 100) state.health = 100
      },
      resetDeath(state) {
        state.deadHolder = null
      },
      reset(state) {
        state.holder = null
        state.deadHolder = null
        state.health = null
      },
    },
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'switch',
        options: [
          { label: 'Sword', value: 'sword' },
          { label: 'Gun', value: 'gun' },
        ],
        initial: 'sword',
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
        key: 'regenRate',
        label: 'Health Regen',
        type: 'float',
        initial: 10,
      },
      {
        key: 'attackSpeed',
        label: 'Attack Speed',
        type: 'float',
        initial: 0.25,
      },
      {
        key: 'attackRange',
        label: 'Attack Range',
        type: 'float',
        initial: 1.5,
      },
      {
        key: 'custom',
        label: 'Custom Model Settings',
        type: 'section',
      },
      {
        key: 'model',
        label: 'Model',
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
        key: 'attackAudio',
        label: 'Attack Sound',
        type: 'file',
        accept: '.mp3',
      },
      {
        key: 'scale',
        label: 'Scale',
        type: 'float',
        initial: 1.0,
      },
      {
        key: 'pos',
        label: 'Position',
        type: 'vec3',
        initial: [0, 0, 0],
      },
      {
        key: 'rot',
        label: 'Rotation',
        type: 'vec3',
        initial: [0, 0, 0],
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
