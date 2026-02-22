import mongoose from 'mongoose';

export async function clearDatabase() {
	(await mongoose.connection.listCollections())
		.filter(
			(collection) =>
				collection.type !== 'view' && !collection.name.includes('system'),
		)
		.forEach((collection) => {
			mongoose.connection.collection(collection.name).deleteMany({});
		});
}
