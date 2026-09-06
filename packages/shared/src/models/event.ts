enum EventType {
	CREATE = 'CREATE',
	UPDATE = 'UPDATE',
	DELETE = 'DELETE',
}

export interface IEvent<T> {
	id: string;
	data?: T;
	type: EventType;
}
