/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    ownerSession?:import('./lib/owner-session').OwnerSession;
  }
}
