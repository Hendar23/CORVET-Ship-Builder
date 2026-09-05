const crewConfig = {
    cost: 20,
    roomsPerCrew: 3
};

const crewPerks = [
    {
        id: "none",
        name: "No Perk",
        cost: 0
    },
    {
        id: "pilot",
        name: "Pilot",
        cost: 30
    },
    {
        id: "gunner",
        name: "Gunner",
        cost: 20
    },
    {
        id: "engineer",
        name: "Engineer",
        cost: 20
    },
    {
        id: "soldier",
        name: "Soldier",
        cost: 20
    },
    {
        id: "runner",
        name: "Runner",
        cost: 20
    }
];

const hullDatabase = [
    {
        id: "hull_light",
        name: "Light Hull",
        hp: 4,
        cost: 10
    },
    {
        id: "hull_medium",
        name: "Medium Hull",
        hp: 6,
        cost: 30
    },
    {
        id: "hull_heavy",
        name: "Heavy Hull",
        hp: 8,
        cost: 60
    }
];

const shieldDatabase = [
    { id: "shield_light", name: "Light Shields", hp: 2, cost: 15 },
    { id: "shield_medium", name: "Medium Shields", hp: 3, cost: 30 },
    { id: "shield_heavy", name: "Heavy Shields", hp: 4, cost: 50 }
];

const roomDatabase = [
    {
        id: "corridor_v",
        name: "Corridor Vertical",
        type: "corridor",
        cost: 0,
        width: 70,
        height: 180,
        max_connections: 4
    },
    {
        id: "corridor_v_s",
        name: "Corridor Short Vert",
        type: "corridor",
        cost: 0,
        width: 70,
        height: 90,
        max_connections: 4
    },
    {
        id: "corridor_h",
        name: "Corridor Horizontal ",
        type: "corridor",
        cost: 0,
        width: 180,
        height: 70,
        max_connections: 4
    },
    {
        id: "corridor_h_s",
        name: "Corridor Short Hor ",
        type: "corridor",
        cost: 0,
        width: 90,
        height: 70,
        max_connections: 4
    },
    {
        id: "corridor_curve_ne",
        name: "Corridor Curve NE",
        type: "corridor",
        cost: 0,
        width: 90,
        height: 90,
        max_connections: 2
    },
    {
        id: "corridor_curve_nw",
        name: "Corridor Curve NW",
        type: "corridor",
        cost: 0,
        width: 90,
        height: 90,
        max_connections: 2
    },
    {
        id: "corridor_curve_se",
        name: "Corridor Curve SE",
        type: "corridor",
        cost: 0,
        width: 90,
        height: 90,
        max_connections: 2
    },
    {
        id: "corridor_curve_sw",
        name: "Corridor Curve SW",
        type: "corridor",
        cost: 0,
        width: 90,
        height: 90,
        max_connections: 2
    },
    {
        id: "corridor_circle",
        name: "Corridor Hub",
        type: "corridor",
        cost: 0,
        width: 130,
        height: 130,
        max_connections: 4
    },

    {
        id: "reactor_light",
        name: "Micro Reactor",
        type: "core",
        core_category: "reactor",
        cost: 10,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 4,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "reactor",
        name: "Reactor",
        type: "core",
        core_category: "reactor",
        cost: 30,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 6,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "reactor_heavy",
        name: "Heavy Reactor",
        type: "core",
        core_category: "reactor",
        cost: 60,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 8,
        is_mannable: true,
        ammo: 0
    },

    {
        id: "engine",
        name: "Engine",
        type: "core",
        core_category: "engine",
        cost: 0,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "helm",
        name: "Helm",
        type: "core",
        core_category: "helm",
        cost: 0,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0
    },

    {
        id: "batteries",
        name: "Batteries",
        type: "auxiliary",
        cost: 10,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "point_def",
        name: "Point Defense",
        type: "auxiliary",
        cost: 10,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 1,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "targeting",
        name: "Targeting Computer",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "shield_generator",
        name: "Shield Generator",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "teleporter",
        name: "Teleporter",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "medical_room",
        name: "Medbay",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "tractor_beam",
        name: "Tractor Beam",
        type: "auxiliary",
        cost: 20,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 3,
        is_mannable: true,
        ammo: 0
    },  
    {
        id: "nanobots",
        name: "Nanobot Controller",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: false,
        ammo: 0
    },
    {
        id: "fire_suppression",
        name: "Fire Suppression",
        type: "auxiliary",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "atomic_laser",
        name: "Atomic Laser",
        type: "weapon",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0,
        has_arc: true
    },
    {
        id: "hacking_device",
        name: "Hacking Device",
        type: "weapon",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0
    },
    {
        id: "ion_pulser",
        name: "Ion Pulser",
        type: "weapon",
        cost: 10,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 3,
        is_mannable: true,
        ammo: 0,
        has_arc: true
    },
    {
        id: "macrobeam",
        name: "Macrobeam",
        type: "weapon",
        cost: 30,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 6,
        is_mannable: true,
        ammo: 0,
        has_arc: true
    },
    {
        id: "railgun",
        name: "Railgun",
        type: "weapon",
        cost: 10,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 3,
        is_mannable: true,
        ammo: 0,
        has_arc: true
    },
    {
        id: "microwave",
        name: "Microwave Gun",
        type: "weapon",
        cost: 15,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 2,
        is_mannable: true,
        ammo: 0,
        has_arc: true
    },
    {
        id: "seeker_missiles",
        name: "Seeker Missiles",
        type: "weapon",
        cost: 20,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 1,
        is_mannable: false,
        ammo: 3
    },
    {
        id: "swarm_missiles",
        name: "Swarm Missiles",
        type: "weapon",
        cost: 20,
        width: 130,
        height: 180,
        max_connections: 3,
        max_hp: 3,
        is_mannable: false,
        ammo: 6
    }
];