import type { Mutex } from 'async-mutex';
import type mongoose from 'mongoose';
import type { Audit } from './audit.model';

export enum ChangeOperationType {
	ADD = 'add',
	REPLACE = 'replace',
	REMOVE = 'remove',
}

export enum CommitType {
	INITIAL = 'INITIAL',
	UPDATE = 'UPDATE',
	TERMINAL = 'TERMINAL',
}

export interface Change<T>
	extends Omit<Audit, 'state' | 'changes' | 'properties'> {
	state: T;
	properties: (keyof T)[];
	changes: { op: ChangeOperationType; path: [keyof T]; value: any }[];
}

export type ChangeListeningOptions = {
	author?: string;
	omitFields?: string[];
	models: mongoose.Model<any>[];
	mutex?: Mutex;
};
