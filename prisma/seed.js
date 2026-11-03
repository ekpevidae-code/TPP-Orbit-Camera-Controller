import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const cars = [
  { id: 'falcon-gt', name: 'Falcon GT', class: 'C', price: 0, topSpeed: 54, acceleration: 26, handling: 5.5, nitroCapacity: 100 },
  { id: 'vortex-r', name: 'Vortex R', class: 'B', price: 42000, topSpeed: 57, acceleration: 30, handling: 5.2, nitroCapacity: 92 },
  { id: 'apex-rs', name: 'Apex RS', class: 'A', price: 85000, topSpeed: 62, acceleration: 24, handling: 4.8, nitroCapacity: 110 },
  { id: 'd-class-sprint', name: 'Sprint 160', class: 'D', price: 12000, topSpeed: 42, acceleration: 22, handling: 6.2, nitroCapacity: 90 },
  { id: 's-class-tempest', name: 'Tempest X', class: 'S', price: 180000, topSpeed: 72, acceleration: 34, handling: 6.4, nitroCapacity: 120 }
];
for (const car of cars) await prisma.carModel.upsert({ where: { id: car.id }, update: car, create: car });
console.log(`Seeded ${cars.length} Velocity Run cars`);
await prisma.$disconnect();
