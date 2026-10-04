import { createRouter, createWebHistory } from 'vue-router'

import Dashboard from '@/views/Dashboard.vue'
const Substation = () => import('@/views/substation/index.vue')
const Protectiondevice = () => import('@/views/protectiondevice/index.vue')
const Settingvalue = () => import('@/views/settingvalue/index.vue')
const Settingcheck = () => import('@/views/settingcheck/index.vue')
const Secondarycircuit = () => import('@/views/secondarycircuit/index.vue')
const Relaytest = () => import('@/views/relaytest/index.vue')
const Faultrecord = () => import('@/views/faultrecord/index.vue')
const Tripstat = () => import('@/views/tripstat/index.vue')
const Transformermaint = () => import('@/views/transformermaint/index.vue')
const Breaker = () => import('@/views/breaker/index.vue')
const BreakerDetail = () => import('@/views/breaker/detail.vue')
const Dcsystem = () => import('@/views/dcsystem/index.vue')
const Insulationtest = () => import('@/views/insulationtest/index.vue')
const Defect = () => import('@/views/defect/index.vue')
const Workpermit = () => import('@/views/workpermit/index.vue')
const Patrol = () => import('@/views/patrol/index.vue')
const Meteringcheck = () => import('@/views/meteringcheck/index.vue')
const Settingapprove = () => import('@/views/settingapprove/index.vue')
const Safetytool = () => import('@/views/safetytool/index.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/substation', name: 'substation', component: Substation },
    { path: '/protectiondevice', name: 'protectiondevice', component: Protectiondevice },
    { path: '/settingvalue', name: 'settingvalue', component: Settingvalue },
    { path: '/settingcheck', name: 'settingcheck', component: Settingcheck },
    { path: '/secondarycircuit', name: 'secondarycircuit', component: Secondarycircuit },
    { path: '/relaytest', name: 'relaytest', component: Relaytest },
    { path: '/faultrecord', name: 'faultrecord', component: Faultrecord },
    { path: '/tripstat', name: 'tripstat', component: Tripstat },
    { path: '/transformermaint', name: 'transformermaint', component: Transformermaint },
    { path: '/breaker', name: 'breaker', component: Breaker },
    { path: '/breaker/:id', name: 'breaker-detail', component: BreakerDetail },
    { path: '/dcsystem', name: 'dcsystem', component: Dcsystem },
    { path: '/insulationtest', name: 'insulationtest', component: Insulationtest },
    { path: '/defect', name: 'defect', component: Defect },
    { path: '/workpermit', name: 'workpermit', component: Workpermit },
    { path: '/patrol', name: 'patrol', component: Patrol },
    { path: '/meteringcheck', name: 'meteringcheck', component: Meteringcheck },
    { path: '/settingapprove', name: 'settingapprove', component: Settingapprove },
    { path: '/safetytool', name: 'safetytool', component: Safetytool },
  ],
})

export default router
